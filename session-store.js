/**
 * SQLite session store using the existing better-sqlite3 instance.
 * Stores sessions in sessions.db (separate file from tlms.db).
 * Compatible with express-session.
 */

const Database = require('better-sqlite3');
const path = require('path');

module.exports = function makeSQLiteStore(session) {
  const Store = session.Store;

  class BetterSQLiteStore extends Store {
    constructor(options = {}) {
      super(options);

      const dbPath = options.dbPath || path.join(__dirname, 'sessions.db');
      this.ttl = options.ttl || 8 * 60 * 60; // seconds, default 8 hours

      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          sess TEXT NOT NULL,
          expired_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);
      `);

      // Clean up expired sessions every 15 minutes
      this._cleanup();
      this._cleanupTimer = setInterval(() => this._cleanup(), 15 * 60 * 1000);
      if (this._cleanupTimer.unref) this._cleanupTimer.unref();
    }

    _cleanup() {
      const now = Math.floor(Date.now() / 1000);
      this.db.prepare('DELETE FROM sessions WHERE expired_at <= ?').run(now);
    }

    _ttl(session) {
      if (session && session.cookie && session.cookie.expires) {
        const ms = new Date(session.cookie.expires) - Date.now();
        return Math.ceil(ms / 1000);
      }
      return this.ttl;
    }

    get(sid, cb) {
      try {
        const now = Math.floor(Date.now() / 1000);
        const row = this.db.prepare(
          'SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?'
        ).get(sid, now);
        if (!row) return cb(null, null);
        cb(null, JSON.parse(row.sess));
      } catch (err) {
        cb(err);
      }
    }

    set(sid, session, cb) {
      try {
        const ttl = this._ttl(session);
        const expiredAt = Math.floor(Date.now() / 1000) + ttl;
        const sess = JSON.stringify(session);
        this.db.prepare(`
          INSERT INTO sessions(sid, sess, expired_at) VALUES(?, ?, ?)
          ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at
        `).run(sid, sess, expiredAt);
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    destroy(sid, cb) {
      try {
        this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    touch(sid, session, cb) {
      try {
        const ttl = this._ttl(session);
        const expiredAt = Math.floor(Date.now() / 1000) + ttl;
        this.db.prepare(
          'UPDATE sessions SET expired_at = ? WHERE sid = ?'
        ).run(expiredAt, sid);
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    length(cb) {
      try {
        const now = Math.floor(Date.now() / 1000);
        const row = this.db.prepare(
          'SELECT COUNT(*) as c FROM sessions WHERE expired_at > ?'
        ).get(now);
        cb(null, row.c);
      } catch (err) {
        cb(err);
      }
    }

    clear(cb) {
      try {
        this.db.prepare('DELETE FROM sessions').run();
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    close() {
      clearInterval(this._cleanupTimer);
      this.db.close();
    }
  }

  return BetterSQLiteStore;
};
