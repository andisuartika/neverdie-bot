import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DISCORD_TOKEN = 'x';
process.env.DISCORD_CLIENT_ID = 'x';
process.env.GUILD_ID = 'x';
process.env.NINEROUTER_BASE_URL = 'http://localhost:1/v1';
process.env.NINEROUTER_API_KEY = 'k';

const { openDb } = await import('../src/db.js');
const { createAskLog } = await import('../src/asklog.js');
const { createLimiter } = await import('../src/limiter.js');
const { createAlerter } = await import('../src/alerts.js');
const { runBackup } = await import('../src/backup.js');
const { askWithFallback, AiError } = await import('../src/ai.js');
const { buildStatsEmbedData } = await import('../src/commands/stats.js');
const { feedbackRow } = await import('../src/commands/ask.js');

const base = { channelId: 'c', tier: 'member', mode: 'umum', question: 'q' };

test('askLog: rating hanya oleh pemilik, stats menghitung benar', () => {
  const log = createAskLog(openDb(':memory:'));
  const a = log.add({ ...base, userId: 'u1', model: 'm', ok: true, latencyMs: 2000 });
  const b = log.add({ ...base, userId: 'u2', model: 'm', ok: true, latencyMs: 4000 });
  log.add({ ...base, userId: 'u1', ok: false, error: 'timeout' });
  log.add({ ...base, userId: 'u1', ok: false, error: 'timeout' });
  assert.equal(log.rate(a, 'u2', 1), false); // bukan pemilik
  assert.equal(log.rate(a, 'u1', 1), true);
  assert.equal(log.rate(b, 'u2', -1), true);
  const s = log.stats();
  assert.equal(s.total, 4);
  assert.equal(s.ok, 2);
  assert.equal(s.users, 2);
  assert.equal(Math.round(s.avg_ms), 3000);
  assert.equal(s.up, 1);
  assert.equal(s.down, 1);
  assert.deepEqual(s.errors, [{ error: 'timeout', n: 2 }]);
  assert.equal(s.top[0].n, 1);
});

test('askLog: purge menghapus log lama', () => {
  let t = 10 * 86_400_000;
  const log = createAskLog(openDb(':memory:'), { now: () => t });
  const id = log.add({ ...base, userId: 'u', ok: true });
  t += 31 * 86_400_000;
  assert.equal(log.purge(30), 1);
  assert.equal(log.get(id), undefined);
});

test('limiter: maksimal N berjalan bersamaan, sisanya antre berurutan', async () => {
  const lim = createLimiter(2);
  let running = 0, peak = 0;
  const order = [];
  const job = (n) => lim.run(async () => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 15));
    running--; order.push(n);
  });
  const all = [1, 2, 3, 4, 5].map(job);
  assert.equal(lim.active, 2);
  assert.equal(lim.waiting, 3);
  await Promise.all(all);
  assert.equal(peak, 2);
  assert.deepEqual(order.sort(), [1, 2, 3, 4, 5]);
  assert.equal(lim.active, 0);
});

test('limiter: kegagalan satu pekerjaan tidak menahan antrean', async () => {
  const lim = createLimiter(1);
  const bad = lim.run(async () => { throw new Error('x'); });
  const good = lim.run(async () => 'ok');
  await assert.rejects(bad);
  assert.equal(await good, 'ok');
});

test('alerter: kirim setelah ambang, tidak spam, kabar pulih', async () => {
  let t = 0;
  const sent = [];
  const a = createAlerter({ send: async (m) => sent.push(m), threshold: 3, cooldownMs: 1000, now: () => t });
  await a.failure('x'); await a.failure('x');
  assert.equal(sent.length, 0);
  await a.failure('network');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /network/);
  await a.failure('x'); // masih dalam cooldown
  assert.equal(sent.length, 1);
  t += 2000;
  await a.failure('x'); // cooldown lewat
  assert.equal(sent.length, 2);
  await a.success();
  assert.equal(sent.length, 3);
  assert.match(sent[2], /pulih/);
  await a.success(); // tidak ada kabar ganda
  assert.equal(sent.length, 3);
});

test('alerter: error saat kirim tidak melempar', async () => {
  const a = createAlerter({ send: async () => { throw new Error('no perms'); }, threshold: 1 });
  await a.failure('x');
});

test('backup: membuat berkas harian dan menyimpan N terbaru', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nvbk-'));
  const db = openDb(join(dir, 'bot.db'));
  db.prepare("INSERT INTO usage (day, user_id, tier, count) VALUES ('d','u','member',1)").run();
  const bk = join(dir, 'backup');
  for (const day of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']) {
    await runBackup(db, { dir: bk, keep: 3, day });
  }
  assert.deepEqual(readdirSync(bk).sort(), ['bot-2026-10-21.db', 'bot-2026-10-22.db', 'bot-2026-10-23.db']);
  const file = await runBackup(db, { dir: bk, keep: 3, day: '2026-10-23' }); // hari sama: tidak menimpa
  assert.ok(existsSync(file));
  const copy = openDb(file);
  assert.equal(copy.prepare('SELECT count FROM usage').get().count, 1);
});

test('askWithFallback: pakai cadangan hanya saat utama gagal', async () => {
  const calls = [];
  const mk = (failFor) => async (_u, o) => {
    const model = JSON.parse(o.body).model;
    calls.push(model);
    if (model === failFor) return { ok: false, status: 502 };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'jawab ' + model } }] }) };
  };
  const r1 = await askWithFallback({ model: 'A', fallback: 'B', question: 'q', maxTokens: 5, fetchImpl: mk('A') });
  assert.deepEqual([r1.text, r1.model], ['jawab B', 'B']);
  calls.length = 0;
  const r2 = await askWithFallback({ model: 'A', fallback: 'B', question: 'q', maxTokens: 5, fetchImpl: mk('zzz') });
  assert.deepEqual([r2.model, calls], ['A', ['A']]);
  await assert.rejects(
    askWithFallback({ model: 'A', fallback: '', question: 'q', maxTokens: 5, fetchImpl: mk('A') }),
    (e) => e instanceof AiError,
  );
  await assert.rejects(
    askWithFallback({ model: 'A', fallback: 'B', question: 'q', maxTokens: 5, fetchImpl: async () => ({ ok: false, status: 500 }) }),
    (e) => e instanceof AiError && e.message === 'http_500',
  );
});

test('stats embed dan tombol punya bentuk yang valid', () => {
  const log = createAskLog(openDb(':memory:'));
  log.add({ ...base, userId: 'u1', model: 'm', ok: true, latencyMs: 1500 });
  const e = buildStatsEmbedData(log.stats(), { globalUsed: 1, globalLimit: 300 });
  assert.ok(e.fields.every((f) => f.name.length <= 256 && f.value.length <= 1024));
  assert.match(JSON.stringify(e), /1\/300/);
  assert.equal(feedbackRow(7).components.length, 3);
  assert.equal(feedbackRow(7, { rated: true }).components.length, 1);
  assert.equal(feedbackRow(7).components[0].data.custom_id, 'nv:up:7');
});
