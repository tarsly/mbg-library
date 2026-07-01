import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ChatDb } from './chat-db.js';
import { adaptRows } from './filters.js';
import { getMarker, setMarker, stateFilePath } from './marker-store.js';
import * as sender from './applescript-sender.js';

/**
 * Register all 6 iMessage tools on the MCP server.
 * chatDb must be opened before any tool is invoked.
 */
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
