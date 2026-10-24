import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DISCORD_TOKEN = 'x';
process.env.DISCORD_CLIENT_ID = 'x';
process.env.GUILD_ID = 'x';
process.env.NINEROUTER_BASE_URL = 'http://localhost:1/v1';
process.env.NINEROUTER_API_KEY = 'k';
process.env.DEV_ROLE_IDS = 'd';
process.env.ADMIN_ROLE_IDS = 'a';
process.env.MODERATOR_ROLE_IDS = 'm';
process.env.PROGRAMMER_ROLE_IDS = 'p';

const { openDb, createUsageStore, today } = await import('../src/db.js');
const { askAI, fitDiscord, AiError } = await import('../src/ai.js');

test('batas harian per user', () => {
  const s = createUsageStore(openDb(':memory:'));
  assert.equal(s.tryConsume('u1', 'member', 2, 100).ok, true);
  assert.equal(s.tryConsume('u1', 'member', 2, 100).ok, true);
  const third = s.tryConsume('u1', 'member', 2, 100);
  assert.equal(third.ok, false);
  assert.equal(third.reason, 'user');
});

test('refund mengembalikan jatah', () => {
  const s = createUsageStore(openDb(':memory:'));
  const r = s.tryConsume('u1', 'member', 1, 100);
  assert.equal(s.tryConsume('u1', 'member', 1, 100).ok, false);
  s.refund('u1', r.day);
  assert.equal(s.tryConsume('u1', 'member', 1, 100).ok, true);
});

test('batas global hanya untuk non-staf', () => {
  const s = createUsageStore(openDb(':memory:'));
  assert.equal(s.tryConsume('a', 'member', 5, 2).ok, true);
  assert.equal(s.tryConsume('b', 'member', 5, 2).ok, true);
  const blocked = s.tryConsume('c', 'member', 5, 2);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'global');
  assert.equal(s.tryConsume('boss', 'staff', 5, 2).ok, true); // staf tidak terkena batas global
});

test('format tanggal zona waktu', () => {
  assert.match(today('Asia/Makassar', new Date('2026-10-25T17:00:00Z')), /^2026-10-26$/); // WITA = UTC+8
});

test('askAI memakai jawaban model & tidak membocorkan error', async () => {
  const ok = await askAI({
    model: 'm', question: 'hai', maxTokens: 10,
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: ' halo ' } }] }) }),
  });
  assert.equal(ok, 'halo');
  await assert.rejects(
    askAI({ model: 'm', question: 'hai', maxTokens: 10, fetchImpl: async () => ({ ok: false, status: 500 }) }),
    (e) => e instanceof AiError && e.message === 'http_500',
  );
  await assert.rejects(
    askAI({ model: 'm', question: 'hai', maxTokens: 10, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    (e) => e instanceof AiError && e.message === 'empty',
  );
});

test('fitDiscord memotong pesan panjang', () => {
  assert.ok(fitDiscord('a'.repeat(5000)).length <= 1850);
  assert.equal(fitDiscord('pendek'), 'pendek');
});

test('dev tanpa batas, moderator 50, admin tidak kena batas global', async () => {
  const s = createUsageStore(openDb(':memory:'));
  for (let i = 0; i < 500; i++) assert.equal(s.tryConsume('dev', 'dev', Infinity, 1).ok, true);
  for (let i = 0; i < 50; i++) assert.equal(s.tryConsume('mod', 'moderator', 50, 1).ok, true);
  assert.equal(s.tryConsume('mod', 'moderator', 50, 1).ok, false);
  assert.equal(s.tryConsume('adm', 'admin', 100, 1).ok, true);
  assert.equal(s.globalToday(), 0);
});

test('urutan tingkat berdasarkan role', async () => {
  const { getTier: gt } = await import('../src/tier.js');
  const mk = (ids, owner = false) => ({
    id: 'x',
    guild: { ownerId: owner ? 'x' : 'y' },
    roles: { cache: { has: (id) => ids.includes(id) } },
  });
  assert.equal(gt(mk([], true)), 'dev');
  assert.equal(gt(mk(['d'])), 'dev');
  assert.equal(gt(mk(['a', 'p'])), 'admin');
  assert.equal(gt(mk(['m', 'p'])), 'moderator');
  assert.equal(gt(mk(['p'])), 'programmer');
  assert.equal(gt(mk([])), 'member');
});

test('ingatan percakapan: urutan, batas turn, kedaluwarsa, reset', async () => {
  const { createMemoryStore } = await import('../src/memory.js');
  let t = 1_000_000;
  const m = createMemoryStore(openDb(':memory:'), { turns: 2, ttlMin: 10, maxChars: 10, now: () => t });
  m.add('u', 'c', 'q1', 'a1');
  m.add('u', 'c', 'q2', 'a2');
  m.add('u', 'c', 'q3', 'a3');
  assert.deepEqual(m.history('u', 'c').map((x) => x.content), ['q2', 'a2', 'q3', 'a3']);
  assert.deepEqual(m.history('u', 'lain'), []); // beda channel tidak bercampur
  m.add('u', 'c', 'x'.repeat(50), 'y');
  assert.ok(m.history('u', 'c').every((x) => x.content.length <= 11)); // dipotong
  t += 11 * 60_000; // lewat TTL
  assert.deepEqual(m.history('u', 'c'), []);
  m.add('u', 'c', 'q', 'a');
  assert.equal(m.clear("u"), 4); // 2 tanya-jawab = 4 pesan
  assert.deepEqual(m.history('u', 'c'), []);
});

test('askAI mengirim riwayat, prompt teknis, dan membersihkan mention', async () => {
  const { buildSystemPrompt, cleanAnswer } = await import('../src/ai.js');
  let body;
  const out = await askAI({
    model: 'm', question: 'baru', maxTokens: 10, mode: 'teknis',
    history: [{ role: 'user', content: 'lama' }, { role: 'assistant', content: 'jawab lama' }],
    fetchImpl: async (_u, o) => {
      body = JSON.parse(o.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '<think>x</think>Halo @everyone <@123>' } }] }) };
    },
  });
  assert.deepEqual(body.messages.map((x) => x.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(body.messages.at(-1).content, 'baru');
  assert.match(body.messages[0].content, /Mode teknis/);
  assert.doesNotMatch(buildSystemPrompt('umum'), /Mode teknis/);
  assert.equal(body.stream, false);
  assert.ok(!/<think>/.test(out) && !out.includes('@everyone') && !out.includes('<@123>'));
  assert.equal(cleanAnswer('biasa saja'), 'biasa saja');
});

test('/help: isi dinamis sesuai tingkat dan pengaturan', async () => {
  const { buildHelpFields } = await import('../src/commands/help.js');
  const { config: cfg } = await import('../src/config.js');
  const h = buildHelpFields({ tier: 'moderator', used: 7, cfg });
  const all = JSON.stringify(h);
  assert.match(all, /7\/50/); // jatah moderator
  assert.match(all, /← kamu/);
  assert.match(all, /∞/); // dev tanpa batas
  assert.ok(h.fields.every((f) => f.value.length <= 1024 && f.name.length <= 256));
});
