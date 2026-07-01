import { randomUUID } from 'node:crypto';
import type { ChatDbRow } from './chat-db.js';
import { extractText } from './body-parser.js';

export interface IMessageRecord {
  id: string;
  rowid: number;
  chatGuid: string;
  sender: string;
  isFromMe: boolean;
  content: string;
  timestamp: string;
  attachments: AttachmentInfo[];
}

export interface AttachmentInfo {
  path: string;
  mimeType: string;
  name: string;
}

/**
 * Converts a raw chat.db row into an IMessageRecord.
 * Returns null for rows that should be filtered (tapbacks, empty, no chat).
 */
export function adaptChatDbRow(row: ChatDbRow): IMessageRecord | null {
  if (row.associated_message_type !== 0) return null;
  if (!row.chat_guid) return null;

  const content = extractText(row.attributedBody, row.text);
  const attachments = parseAttachments(row);
  if (!content && attachments.length === 0) return null;

  return {
    id: randomUUID(),
    rowid: row.rowid,
    chatGuid: row.chat_guid,
    sender: row.sender ?? (row.is_from_me ? 'me' : 'unknown'),
    isFromMe: row.is_from_me === 1,
    content,
    timestamp: new Date().toISOString(),
    attachments,
  };
}

function parseAttachments(row: ChatDbRow): AttachmentInfo[] {
  if (!row.attachment_paths) return [];
  const paths = row.attachment_paths.split('||');
  const mimes = row.attachment_mimes?.split('||') ?? [];
  const names = row.attachment_names?.split('||') ?? [];
  const result: AttachmentInfo[] = [];
  for (let i = 0; i < paths.length; i++) {
    if (paths[i]) {
      result.push({
        path: paths[i],
        mimeType: mimes[i] ?? 'application/octet-stream',
        name: names[i] ?? '',
      });
    }
  }
  return result;
}
