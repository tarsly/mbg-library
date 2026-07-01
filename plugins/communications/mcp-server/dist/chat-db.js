import Database from 'better-sqlite3';
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
             m.is_from_me,
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
             m.is_from_me,
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
        const stmt = this.db.prepare(`
      SELECT c.guid AS chat_guid,
             c.display_name AS display_name,
             GROUP_CONCAT(h.id, '||') AS participants,
             MAX(m.rowid) AS last_message_rowid
      FROM chat c
      LEFT JOIN chat_handle_join chj ON chj.chat_id = c.rowid
      LEFT JOIN handle h ON h.rowid = chj.handle_id
      LEFT JOIN chat_message_join cmj ON cmj.chat_id = c.rowid
      LEFT JOIN message m ON m.rowid = cmj.message_id
      WHERE (c.display_name IS NOT NULL AND c.display_name LIKE ?)
         OR c.guid LIKE ?
         OR EXISTS (
              SELECT 1 FROM chat_handle_join chj2
              JOIN handle h2 ON h2.rowid = chj2.handle_id
              WHERE chj2.chat_id = c.rowid AND h2.id LIKE ?
            )
      GROUP BY c.rowid
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
