import { adaptChatDbRow } from './adapter.js';
/**
 * Apply the row filter set: adapt rows to IMessageRecord, drop tapbacks/empty (via adapter),
 * and optionally drop is_from_me for inbound-only tools.
 */
export function adaptRows(rows, opts = {}) {
    const out = [];
    for (const row of rows) {
        if (opts.inboundOnly && row.is_from_me === 1)
            continue;
        const record = adaptChatDbRow(row);
        if (!record)
            continue;
        out.push(record);
    }
    return out;
}
