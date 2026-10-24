import { config } from './config.js';

// Ingatan percakapan singkat. Disimpan lokal di SQLite, hanya tanya-jawab terakhir
// dan otomatis kedaluwarsa. Tidak ada isi system prompt yang pernah disimpan di sini.
export function createMemoryStore(db, opts = {}) {
  const turns = opts.turns ?? config.memory.turns;
  const ttlMs = (opts.ttlMin ?? config.memory.ttlMin) * 60_000;
  const maxChars = opts.maxChars ?? config.memory.maxChars;
  const now = opts.now ?? (() => Date.now());

  const select = db.prepare(
    `SELECT role, content FROM chat_memory
     WHERE user_id = ? AND channel_id = ? AND ts >= ?
     ORDER BY id DESC LIMIT ?`,
  );
  const insert = db.prepare(
    'INSERT INTO chat_memory (user_id, channel_id, role, content, ts) VALUES (?, ?, ?, ?, ?)',
  );
  const prune = db.prepare(
    `DELETE FROM chat_memory WHERE user_id = ? AND channel_id = ? AND id NOT IN (
       SELECT id FROM chat_memory WHERE user_id = ? AND channel_id = ? ORDER BY id DESC LIMIT ?)`,
  );
  const purge = db.prepare('DELETE FROM chat_memory WHERE ts < ?');
  const clearUser = db.prepare('DELETE FROM chat_memory WHERE user_id = ?');

  const cut = (t) => (t.length > maxChars ? t.slice(0, maxChars) + '…' : t);

  return {
    // Mengembalikan pesan lama (urut dari terlama) untuk dikirim sebagai konteks.
    history(userId, channelId) {
      if (turns <= 0) return [];
      return select.all(userId, channelId, now() - ttlMs, turns * 2).reverse();
    },
    // Simpan satu pasang tanya-jawab (hanya dipanggil kalau jawaban berhasil).
    add(userId, channelId, question, answer) {
      if (turns <= 0) return;
      const t = now();
      insert.run(userId, channelId, 'user', cut(question), t);
      insert.run(userId, channelId, 'assistant', cut(answer), t);
      prune.run(userId, channelId, userId, channelId, turns * 2);
      purge.run(t - 24 * 60 * 60_000);
    },
    // Hapus semua ingatan satu pengguna. Mengembalikan jumlah pesan yang dihapus.
    clear(userId) {
      return clearUser.run(userId).changes;
    },
  };
}
