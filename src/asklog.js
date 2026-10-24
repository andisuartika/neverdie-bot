import { today } from './db.js';
import { config } from './config.js';

// Catatan tiap permintaan /ask (berhasil atau gagal). Dipakai untuk penilaian 👍👎,
// jawab ulang 🔄, dan /stats. Jawaban AI tidak disimpan, hanya pertanyaan.
export function createAskLog(db, { tz = config.tz, now = () => Date.now() } = {}) {
  const ins = db.prepare(`
    INSERT INTO ask_log (ts, day, user_id, channel_id, tier, mode, model, ok, latency_ms, error, question)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare('SELECT * FROM ask_log WHERE id = ?');
  const setRating = db.prepare('UPDATE ask_log SET rating = ? WHERE id = ? AND user_id = ? AND ok = 1');
  const purgeOld = db.prepare('DELETE FROM ask_log WHERE ts < ?');
  const sumDay = db.prepare(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(ok), 0) AS ok,
           COUNT(DISTINCT user_id) AS users,
           AVG(CASE WHEN ok = 1 THEN latency_ms END) AS avg_ms,
           COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0) AS up,
           COALESCE(SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END), 0) AS down
    FROM ask_log WHERE day = ?`);
  const topDay = db.prepare(`
    SELECT user_id, COUNT(*) AS n FROM ask_log WHERE day = ? AND ok = 1
    GROUP BY user_id ORDER BY n DESC LIMIT ?`);
  const errDay = db.prepare(`
    SELECT error, COUNT(*) AS n FROM ask_log WHERE day = ? AND ok = 0
    GROUP BY error ORDER BY n DESC LIMIT 3`);

  return {
    add({ userId, channelId, tier, mode, model, ok, latencyMs = null, error = null, question = '' }) {
      const r = ins.run(now(), today(tz), userId, channelId, tier, mode, model ?? null, ok ? 1 : 0, latencyMs, error, question.slice(0, 1000));
      return Number(r.lastInsertRowid);
    },
    get: (id) => byId.get(id),
    // Hanya pemilik pertanyaan yang boleh menilai. Mengembalikan true jika tersimpan.
    rate: (id, userId, rating) => setRating.run(rating, id, userId).changes > 0,
    stats(day = today(tz), topN = 5) {
      return { day, ...sumDay.get(day), top: topDay.all(day, topN), errors: errDay.all(day) };
    },
    purge(days = config.logRetentionDays) {
      return purgeOld.run(now() - days * 86_400_000).changes;
    },
  };
}
