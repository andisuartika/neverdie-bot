import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { config } from './config.js';
import { today } from './db.js';

// Cadangan SQLite yang aman (API backup bawaan), satu berkas per hari, simpan N terbaru.
export async function runBackup(db, { dir, keep = 7, day }) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `bot-${day}.db`);
  if (!existsSync(file)) await db.backup(file);
  const all = readdirSync(dir)
    .filter((f) => /^bot-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  for (const f of all.slice(0, Math.max(0, all.length - keep))) unlinkSync(join(dir, f));
  return file;
}

// Dijalankan saat bot hidup lalu tiap 6 jam (membuat cadangan hari itu bila belum ada),
// sekaligus menghapus log pertanyaan yang sudah lewat masa simpan.
export function startMaintenance(db, askLog, { intervalMs = 6 * 3_600_000 } = {}) {
  const dir = join(dirname(config.dbPath), 'backup');
  const tick = async () => {
    try {
      await runBackup(db, { dir, keep: config.backupKeep, day: today() });
      const n = askLog.purge();
      if (n) console.log(`[maint] ${n} log lama dihapus`);
    } catch (err) {
      console.error('[maint] gagal:', err?.message ?? err);
    }
  };
  tick();
  setInterval(tick, intervalMs).unref();
}
