import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

export function openDb(path = config.dbPath) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage (
      day     TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tier    TEXT NOT NULL,
      count   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, user_id)
    );
    CREATE TABLE IF NOT EXISTS chat_memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL,
      ts         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_user ON chat_memory (user_id, channel_id, ts);
  `);
  return db;
}

// Tanggal hari ini (YYYY-MM-DD) menurut zona waktu bot.
export function today(tz = config.tz, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Tingkat yang dikecualikan dari batas global ('staff' = data lama sebelum ada pemisahan).
const EXEMPT_TIERS = ['dev', 'admin', 'moderator', 'staff'];

export function createUsageStore(db, { tz = config.tz } = {}) {
  const getUser = db.prepare('SELECT count FROM usage WHERE day = ? AND user_id = ?');
  const getGlobal = db.prepare(
    "SELECT COALESCE(SUM(count), 0) AS total FROM usage WHERE day = ? AND tier NOT IN ('dev', 'admin', 'moderator', 'staff')",
  );
  const upsert = db.prepare(`
    INSERT INTO usage (day, user_id, tier, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, user_id) DO UPDATE SET count = count + 1, tier = excluded.tier
  `);
  const decrement = db.prepare(
    'UPDATE usage SET count = MAX(count - 1, 0) WHERE day = ? AND user_id = ?',
  );

  // Ambil jatah secara atomik. Mengembalikan { ok, reason?, used, limit }.
  const tryConsume = db.transaction((userId, tier, userLimit, globalLimit) => {
    const day = today(tz);
    const used = getUser.get(day, userId)?.count ?? 0;
    if (used >= userLimit) return { ok: false, reason: 'user', used, limit: userLimit };
    if (!EXEMPT_TIERS.includes(tier)) {
      const total = getGlobal.get(day).total;
      if (total >= globalLimit) return { ok: false, reason: 'global', used, limit: userLimit };
    }
    upsert.run(day, userId, tier);
    return { ok: true, used: used + 1, limit: userLimit, day };
  });

  return {
    tryConsume,
    refund: (userId, day) => decrement.run(day ?? today(tz), userId),
    usedToday: (userId) => getUser.get(today(tz), userId)?.count ?? 0,
    globalToday: () => getGlobal.get(today(tz)).total,
  };
}
