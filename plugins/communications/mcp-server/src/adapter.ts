import { randomUUID } from 'node:crypto';
import type { ChatDbRow } from './chat-db.js';
import { extractText } from './body-parser.js';

/** Seconds between Unix epoch (1970-01-01) and Apple Cocoa epoch (2001-01-01) UTC */
const COCOA_EPOCH_OFFSET_S = 978_307_200;
/** Nanoseconds in one second */
const NS_PER_S = 1_000_000_000;
/** Any date value larger than this is presumed nanoseconds; smaller = seconds. */
const NS_HEURISTIC_THRESHOLD = 1_000_000_000_000; // 10^12; ~2001 in ns is 0, ~2100 in s is ~3e9

/**
 * Decode message.date to ISO 8601. macOS ≥ 10.13 stores nanoseconds since 2001-01-01;
 * older versions stored seconds. Returns null timestamp fallback if the value is
 * missing or clearly bad.
 */
function decodeCocoaDate(raw: number | bigint | null): string {
  if (raw === null || raw === undefined) return new Date().toISOString();
  const n = typeof raw === 'bigint' ? Number(raw) : raw;
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  const seconds = n > NS_HEURISTIC_THRESHOLD ? n / NS_PER_S : n;
  const unixMs = (seconds + COCOA_EPOCH_OFFSET_S) * 1000;
  const d = new Date(unixMs);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

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
    sender: row.is_from_me === 1 ? 'me' : (row.sender ?? 'unknown'),
    isFromMe: row.is_from_me === 1,
    content,
    timestamp: decodeCocoaDate(row.date),
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
