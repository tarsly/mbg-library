import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ChatDb } from './chat-db.js';
import { adaptRows } from './filters.js';
import { getMarker, setMarker, stateFilePath } from './marker-store.js';
import * as sender from './applescript-sender.js';
import * as shortcuts from './shortcuts-runner.js';

/**
 * Register all 9 iMessage tools on the MCP server.
 * chatDb must be opened before any tool is invoked.
 */
function jsonResult(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

/**
 * Send the same text to each recipient as a 1:1 message, sequentially with a
 * short gap (Messages.app drops rapid-fire AppleScript sends). Never throws —
 * returns per-recipient outcomes so partial failures are visible.
 */
async function fanOut(
  recipients: string[],
  text: string,
): Promise<Array<{ recipient: string; sent: boolean; error?: string }>> {
  const results: Array<{ recipient: string; sent: boolean; error?: string }> = [];
  for (const recipient of recipients) {
    try {
      await sender.sendToRecipient(recipient, text);
      results.push({ recipient, sent: true });
    } catch (err) {
      results.push({ recipient, sent: false, error: (err as Error).message });
    }
    await shortcuts.sleep(1500);
  }
  return results;
}

export function registerTools(server: McpServer, chatDb: ChatDb): void {
  server.tool(
    'imessage_send',
    'Send an iMessage. Provide EITHER recipient (phone or email) OR chatGuid (existing chat). Not both.',
    {
      recipient: z
        .string()
        .optional()
        .describe('Phone number (E.164 preferred, e.g. +18015551234) or email address'),
      chatGuid: z
        .string()
        .optional()
        .describe('Existing chat GUID from imessage_search_chats. Use for group chats.'),
      text: z.string().min(1).describe('Message body'),
    },
    async ({ recipient, chatGuid, text }) => {
      if ((!recipient && !chatGuid) || (recipient && chatGuid)) {
        throw new Error('Provide exactly one of recipient or chatGuid.');
      }
      if (chatGuid) {
        await sender.sendMessage(chatGuid, text);
      } else {
        await sender.sendToRecipient(recipient!, text);
      }
      return {
        content: [
          { type: 'text' as const, text: `Sent to ${chatGuid ?? recipient}.` },
        ],
      };
    },
  );

  server.tool(
    'imessage_find_group',
    'Find existing chats containing ALL the given participants (2+ phone numbers/emails). Returns exact matches (participant set is precisely these people) first, then supersets (these people plus others). Use BEFORE any multi-recipient send — an existing thread beats creating anything.',
    {
      participants: z
        .array(z.string().min(3))
        .min(2)
        .max(30)
        .describe('Phone numbers (any format) and/or emails. Do not include the sender.'),
    },
    async ({ participants }) => {
      const matches = chatDb.findChatsByParticipants(participants);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                count: matches.length,
                groupShortcutInstalled: await shortcuts.groupShortcutInstalled(),
                matches,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'imessage_send_group',
    'Send one message to multiple people as a GROUP thread. Order of attempts: (1) existing thread with exactly these participants via AppleScript; (2) if none, create the group via the "MBG Group Send" shortcut (requires one-time install by comm-imessage-fast-setup); (3) if that fails and fallbackToIndividual is true, send to each person individually. ALWAYS confirm mode (group vs individual) and failover with the user before calling.',
    {
      participants: z
        .array(z.string().min(3))
        .min(2)
        .max(30)
        .describe('Phone numbers (E.164 preferred) and/or emails. Do not include the sender.'),
      text: z.string().min(1).describe('Message body'),
      fallbackToIndividual: z
        .boolean()
        .default(false)
        .describe('If the group path fails, send to each recipient as separate 1:1 messages. Only set true with explicit user consent.'),
    },
    async ({ participants, text, fallbackToIndividual }) => {
      // 1. Existing thread with exactly these people. If chat.db is unreadable
      // (no Full Disk Access), skip the reuse path — the shortcut can still
      // create/send without ever touching chat.db.
      let dbAvailable = true;
      let existing: ReturnType<typeof chatDb.findChatsByParticipants> = [];
      try {
        existing = chatDb.findChatsByParticipants(participants).filter((m) => m.match === 'exact');
      } catch {
        dbAvailable = false;
      }
      if (existing.length > 0) {
        const target = existing[0];
        await sender.sendMessage(target.chat_guid, text);
        return jsonResult({
          method: 'existing-thread',
          chatGuid: target.chat_guid,
          displayName: target.display_name,
          note: 'Sent to the existing group thread. Reuse this chatGuid for future sends.',
        });
      }

      // 2. Create the group via the Shortcuts bridge.
      if (await shortcuts.groupShortcutInstalled()) {
        try {
          await shortcuts.sendGroupViaShortcut(participants, text);
          // Recover the new thread's GUID so future sends can use AppleScript directly.
          let chatGuid: string | null = null;
          if (dbAvailable) {
            for (let i = 0; i < 5 && !chatGuid; i++) {
              await shortcuts.sleep(2000);
              const found = chatDb.findChatsByParticipants(participants).filter((m) => m.match === 'exact');
              if (found.length > 0) chatGuid = found[0].chat_guid;
            }
          }
          return jsonResult({
            method: 'shortcut-created-group',
            chatGuid,
            note: chatGuid
              ? 'Group created and message sent. Reuse this chatGuid for future sends.'
              : dbAvailable
                ? 'Shortcut reported success but the new thread has not appeared in chat.db yet — ask the user to confirm delivery in Messages, and use imessage_find_group later to pick up the GUID.'
                : 'Sent via shortcut. chat.db is unreadable (no Full Disk Access), so an existing thread could not be checked and the new chatGuid could not be recovered — a duplicate thread is possible if one already existed.',
          });
        } catch (err) {
          if (!fallbackToIndividual) {
            throw new Error(
              `${(err as Error).message} — no fallback was authorized. Options: retry, send individually (fallbackToIndividual), or have the user start the group manually in Messages once.`,
            );
          }
          // fall through to 3
        }
      } else if (!fallbackToIndividual) {
        throw new Error(
          `No existing group thread with these participants, and the "${shortcuts.GROUP_SHORTCUT_NAME}" shortcut is not installed. ` +
            'Options: run comm-imessage-fast-setup to install the shortcut, send individually (fallbackToIndividual), or have the user start the group manually in Messages once.',
        );
      }

      // 3. Authorized failover: individual 1:1 sends.
      const results = await fanOut(participants, text);
      return jsonResult({
        method: 'individual-fanout',
        note: 'Sent as separate 1:1 messages (group path unavailable or failed). These are NOT a group thread.',
        results,
      });
    },
  );

  server.tool(
    'imessage_send_individual',
    'Send the SAME message to multiple people as separate 1:1 conversations (not a group thread). Use when the user explicitly chooses individual sends over a group. Reports per-recipient success/failure.',
    {
      recipients: z
        .array(z.string().min(3))
        .min(2)
        .max(50)
        .describe('Phone numbers (E.164 preferred) and/or emails'),
      text: z.string().min(1).describe('Message body'),
    },
    async ({ recipients, text }) => {
      const results = await fanOut(recipients, text);
      return jsonResult({ method: 'individual-fanout', results });
    },
  );

  server.tool(
    'imessage_search_chats',
    'Search chat.db for chats matching a query against display name, chat GUID, or participant handle (phone/email). Returns chat GUIDs + participants.',
    {
      query: z.string().min(1).describe('Substring to match against display name or participant handle'),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ query, limit }) => {
      const results = chatDb.searchChats(query, limit);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(results, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'imessage_read_chat',
    'Read the most recent messages in a chat by GUID. Includes both sent and received messages.',
    {
      chatGuid: z.string().min(1).describe('Chat GUID from imessage_search_chats'),
      limit: z.number().int().min(1).max(500).default(20),
    },
    async ({ chatGuid, limit }) => {
      const rows = chatDb.fetchChatMessages(chatGuid, limit);
      const messages = adaptRows(rows).sort((a, b) => a.rowid - b.rowid);
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(messages, null, 2) },
        ],
      };
    },
  );

  server.tool(
    'imessage_poll_new',
    'Return inbound messages newer than the persisted marker, then advance the marker. First-ever call initializes the marker to the current chat.db max rowid and returns nothing.',
    {
      limit: z.number().int().min(1).max(500).default(100),
    },
    async ({ limit }) => {
      let marker = getMarker();
      if (marker === null) {
        marker = chatDb.getMaxRowId();
        setMarker(marker);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  bootstrapped: true,
                  marker,
                  messages: [],
                  markerFile: stateFilePath(),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const rows = chatDb.fetchNewMessages(marker, limit);
      const messages = adaptRows(rows, { inboundOnly: true });
      const maxSeenRowId = rows.length > 0 ? rows[rows.length - 1].rowid : marker;
      if (maxSeenRowId > marker) setMarker(maxSeenRowId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                previousMarker: marker,
                newMarker: maxSeenRowId,
                count: messages.length,
                messages,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'imessage_peek_new',
    'Same query as imessage_poll_new but does NOT advance the marker. Safe to call repeatedly for inspection.',
    {
      limit: z.number().int().min(1).max(500).default(100),
    },
    async ({ limit }) => {
      let marker = getMarker();
      if (marker === null) marker = chatDb.getMaxRowId();
      const rows = chatDb.fetchNewMessages(marker, limit);
      const messages = adaptRows(rows, { inboundOnly: true });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { marker, count: messages.length, messages },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'imessage_reset_marker',
    'Set the poll marker to a specific rowid or to the current chat.db max rowid.',
    {
      rowId: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Rowid to set. Omit to reset to current chat.db max.'),
    },
    async ({ rowId }) => {
      const target = rowId ?? chatDb.getMaxRowId();
      setMarker(target);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ marker: target, markerFile: stateFilePath() }, null, 2),
          },
        ],
      };
    },
  );
}
