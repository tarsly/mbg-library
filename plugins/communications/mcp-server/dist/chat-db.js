import Database from 'better-sqlite3';
/**
 * Normalize a handle for participant matching. Emails lowercase; phones compare
 * by their last 10 digits (falling back to all digits for short codes) so
 * formatting and country-code differences don't defeat the match.
 */
export function normalizeHandle(h) {
    const t = h.trim().toLowerCase();
    if (t.includes('@'))
        return t;
    const digits = t.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}
export class ChatDb {
    db = null;
    open(path) {
        const resolved = path.replace(/^~/, process.env.HOME ?? '');
        this.db = new Database(resolved, { readonly: true });
        this.db.pragma('journal_mode = WAL');
    }
    getMaxRowId() {
        this.ensureOpen();
        const row = this.db.prepare('SELECT MAX(rowid) AS maxId FROM message').get();
        return row?.maxId ?? 0;
    }
    fetchNewMessages(sinceRowId, limit) {
        this.ensureOpen();
        const stmt = this.db.prepare(`
      SELECT m.ROWID AS rowid, m.text, m.attributedBody,
             m.cache_has_attachments, m.associated_message_type,
             m.is_from_me, m.date,
             h.id AS sender, c.guid AS chat_guid,
             GROUP_CONCAT(a.filename, '||') AS attachment_paths,
             GROUP_CONCAT(a.mime_type, '||') AS attachment_mimes,
             GROUP_CONCAT(a.transfer_name, '||') AS attachment_names
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.rowid
      LEFT JOIN chat_message_join cmj ON m.rowid = cmj.message_id
      LEFT JOIN chat c ON cmj.chat_id = c.rowid
      LEFT JOIN message_attachment_join maj ON m.rowid = maj.message_id
      LEFT JOIN attachment a ON a.rowid = maj.attachment_id
      WHERE m.rowid > ?
      GROUP BY m.rowid
      ORDER BY m.rowid ASC
      LIMIT ?
    `);
        return stmt.all(sinceRowId, limit);
    }
    fetchChatMessages(chatGuid, limit) {
        this.ensureOpen();
        const stmt = this.db.prepare(`
      SELECT m.ROWID AS rowid, m.text, m.attributedBody,
             m.cache_has_attachments, m.associated_message_type,
             m.is_from_me, m.date,
             h.id AS sender, c.guid AS chat_guid,
             GROUP_CONCAT(a.filename, '||') AS attachment_paths,
             GROUP_CONCAT(a.mime_type, '||') AS attachment_mimes,
             GROUP_CONCAT(a.transfer_name, '||') AS attachment_names
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.rowid
      LEFT JOIN chat_message_join cmj ON m.rowid = cmj.message_id
      LEFT JOIN chat c ON cmj.chat_id = c.rowid
      LEFT JOIN message_attachment_join maj ON m.rowid = maj.message_id
      LEFT JOIN attachment a ON a.rowid = maj.attachment_id
      WHERE c.guid = ?
      GROUP BY m.rowid
      ORDER BY m.rowid DESC
      LIMIT ?
    `);
        return stmt.all(chatGuid, limit);
    }
    searchChats(query, limit) {
        this.ensureOpen();
        const like = `%${query}%`;
        // Correlated subqueries — NOT joined-then-GROUP_CONCATted — so each participant
        // handle is listed once per chat rather than (participants × messages) times.
        const stmt = this.db.prepare(`
      SELECT c.guid AS chat_guid,
             c.display_name AS display_name,
             (
               SELECT GROUP_CONCAT(h.id, '||')
                 FROM chat_handle_join chj
                 JOIN handle h ON h.rowid = chj.handle_id
                WHERE chj.chat_id = c.rowid
             ) AS participants,
             (
               SELECT MAX(m.rowid)
                 FROM chat_message_join cmj
                 JOIN message m ON m.rowid = cmj.message_id
                WHERE cmj.chat_id = c.rowid
             ) AS last_message_rowid
      FROM chat c
      WHERE (c.display_name IS NOT NULL AND c.display_name LIKE ?)
         OR c.guid LIKE ?
         OR EXISTS (
              SELECT 1 FROM chat_handle_join chj2
              JOIN handle h2 ON h2.rowid = chj2.handle_id
              WHERE chj2.chat_id = c.rowid AND h2.id LIKE ?
            )
      ORDER BY last_message_rowid DESC NULLS LAST
      LIMIT ?
    `);
        const rows = stmt.all(like, like, like, limit);
        return rows.map((r) => ({
            chat_guid: r.chat_guid,
            display_name: r.display_name,
            participants: r.participants ? r.participants.split('||').filter(Boolean) : [],
            last_message_rowid: r.last_message_rowid,
        }));
    }
    /**
     * Find chats whose participant set matches the given handles.
     * "exact" = participants are precisely the given handles (the sender is never
     * listed in chat_handle_join, so a group of me+A+B has participants {A,B}).
     * "superset" = chat contains all given handles plus others.
     * Phones compare by last-10-digit suffix so "+18015551234" matches "801-555-1234".
     */
    findChatsByParticipants(handles) {
        this.ensureOpen();
        const wanted = new Set(handles.map(normalizeHandle));
        const stmt = this.db.prepare(`
      SELECT c.guid AS chat_guid,
             c.display_name AS display_name,
             (
               SELECT GROUP_CONCAT(h.id, '||')
                 FROM chat_handle_join chj
                 JOIN handle h ON h.rowid = chj.handle_id
                WHERE chj.chat_id = c.rowid
             ) AS participants,
             (
               SELECT MAX(m.rowid)
                 FROM chat_message_join cmj
                 JOIN message m ON m.rowid = cmj.message_id
                WHERE cmj.chat_id = c.rowid
             ) AS last_message_rowid
      FROM chat c
    `);
        const rows = stmt.all();
        const matches = [];
        for (const r of rows) {
            const participants = r.participants ? r.participants.split('||').filter(Boolean) : [];
            if (participants.length < wanted.size)
                continue;
            const have = new Set(participants.map(normalizeHandle));
            let containsAll = true;
            for (const w of wanted) {
                if (!have.has(w)) {
                    containsAll = false;
                    break;
                }
            }
            if (!containsAll)
                continue;
            matches.push({
                chat_guid: r.chat_guid,
                display_name: r.display_name,
                participants,
                last_message_rowid: r.last_message_rowid,
                match: have.size === wanted.size ? 'exact' : 'superset',
            });
        }
        // Exact matches first, then most recently active.
        return matches.sort((a, b) => {
            if (a.match !== b.match)
                return a.match === 'exact' ? -1 : 1;
            return (b.last_message_rowid ?? 0) - (a.last_message_rowid ?? 0);
        });
    }
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    ensureOpen() {
        if (!this.db) {
            throw new Error('ChatDb is not open. Call open() first.');
        }
    }
}
