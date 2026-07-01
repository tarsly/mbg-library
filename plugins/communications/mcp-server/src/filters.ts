import type { ChatDbRow } from './chat-db.js';
import { adaptChatDbRow, type IMessageRecord } from './adapter.js';

export interface AdaptOptions {
  /** When true, drop rows where is_from_me = 1. Used by poll_new/peek_new for inbound-only. */
  inboundOnly?: boolean;
}

/**
 * Apply the row filter set: adapt rows to IMessageRecord, drop tapbacks/empty (via adapter),
 * and optionally drop is_from_me for inbound-only tools.
 */
export function adaptRows(rows: ChatDbRow[], opts: AdaptOptions = {}): IMessageRecord[] {
  const out: IMessageRecord[] = [];
  for (const row of rows) {
    if (opts.inboundOnly && row.is_from_me === 1) continue;
    const record = adaptChatDbRow(row);
    if (!record) continue;
    out.push(record);
  }
  return out;
}
