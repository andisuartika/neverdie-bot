import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';

process.env.DISCORD_TOKEN = 'x';
process.env.DISCORD_CLIENT_ID = 'x';
process.env.GUILD_ID = 'G';
process.env.NINEROUTER_BASE_URL = 'http://localhost:1/v1';
process.env.NINEROUTER_API_KEY = 'k';
process.env.AI_CHANNEL_IDS = 'AI1,AI2';
process.env.RULES_CHANNEL_ID = 'RULES';
process.env.ROLES_CHANNEL_ID = 'ROLES';
process.env.DEV_ROLE_IDS = 'd';
process.env.ADMIN_ROLE_IDS = 'a';

const { suppress } = await import('../src/suppress.js');
const panel = await import('../src/panel.js');
const { diffRoles, joinEmbed, leaveEmbed, roleEmbed, deleteEmbed } = await import('../src/modlog.js');
const { buildWelcomeText, renderWelcomeCard } = await import('../src/welcome.js');
const { handleButton } = await import('../src/buttons.js');
const panelCmd = await import('../src/commands/panel-role.js');

const perms = (...flags) => ({ has: (f) => flags.includes(f) });
const mkRole = (id, name, p = perms(), editable = true) => ({ id, name, permissions: p, editable });

test('suppress: tanda sekali pakai dan kedaluwarsa', () => {
  suppress.mark('u', 'r', 1000);
  assert.equal(suppress.consume('u', 'r', 1000 + 20_000), false); // kedaluwarsa
  suppress.mark('u', 'r', 1000);
  assert.equal(suppress.consume('u', 'r', 2000), true);
  assert.equal(suppress.consume('u', 'r', 2000), false); // sudah dipakai
});

test('panel: nama cocok tanpa emoji, role berbahaya ditolak', () => {
  assert.equal(panel.normalizeName('💻 Programmer'), 'programmer');
  assert.equal(panel.normalizeName('🌿 Santai & Survival'), 'santai survival');
  const guild = { roles: { cache: [mkRole('1', '💻 Programmer'), mkRole('2', '📱 Mobile Dev')] } };
  guild.roles.cache.find = Array.prototype.find.bind(guild.roles.cache);
  assert.equal(panel.findRole(guild, panel.PANEL_ROLES[0]).id, '1');
  assert.equal(panel.findRole(guild, panel.PANEL_ROLES[2]), undefined);
  assert.equal(panel.isSafeRole(mkRole('x', 'a', perms(PermissionFlagsBits.SendMessages))), true);
  for (const f of [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers, PermissionFlagsBits.MentionEveryone]) {
    assert.equal(panel.isSafeRole(mkRole('x', 'a', perms(f))), false);
  }
});

function mkClick(customId, role, hasRole = false, opts = {}) {
  const calls = [];
  const roles = [role].filter(Boolean);
  roles.find = Array.prototype.find.bind(roles);
  const cache = new Map(hasRole && role ? [[role.id, role]] : []);
  return {
    calls,
    customId,
    user: { id: 'u1' },
    guild: { roles: { cache: roles } },
    member: {
      id: 'u1',
      roles: {
        cache,
        add: async (r) => { if (opts.fail) throw new Error('Missing Permissions'); calls.push(['add', r.id]); },
        remove: async (r) => { calls.push(['remove', r.id]); },
      },
    },
    reply: async (x) => calls.push(['reply', x.content]),
  };
}

test('tombol role: tambah, lepas, dan penolakan yang aman', async () => {
  const prog = mkRole('R1', '💻 Programmer');
  const add = mkClick('nv:role:prog', prog);
  await handleButton(add, {});
  assert.deepEqual(add.calls[0], ['add', 'R1']);
  assert.match(add.calls[1][1], /ditambahkan/);
  assert.equal(suppress.consume('u1', 'R1'), true); // ditandai agar tidak masuk log

  const del = mkClick('nv:role:prog', prog, true);
  await handleButton(del, {});
  assert.deepEqual(del.calls[0], ['remove', 'R1']);
  assert.match(del.calls[1][1], /dilepas/);

  const unknown = mkClick('nv:role:admin', prog);
  await handleButton(unknown, {});
  assert.deepEqual(unknown.calls.map((c) => c[0]), ['reply']); // kunci tidak dikenal: tidak ada perubahan role

  const bad = mkClick('nv:role:prog', mkRole('R1', 'Programmer', perms(PermissionFlagsBits.Administrator)));
  await handleButton(bad, {});
  assert.deepEqual(bad.calls.map((c) => c[0]), ['reply']);
  assert.match(bad.calls[0][1], /tidak bisa diatur/);

  const high = mkClick('nv:role:prog', mkRole('R1', 'Programmer', perms(), false));
  await handleButton(high, {});
  assert.deepEqual(high.calls.map((c) => c[0]), ['reply']);

  const missing = mkClick('nv:role:fps', prog);
  await handleButton(missing, {});
  assert.match(missing.calls[0][1], /belum disiapkan/);

  const fail = mkClick('nv:role:prog', prog, false, { fail: true });
  await handleButton(fail, {});
  assert.match(fail.calls.at(-1)[1], /Gagal/);
  assert.equal(suppress.consume('u1', 'R1'), false); // tanda dibatalkan karena gagal
});

test('panel: bentuk pesan sesuai batas Discord', () => {
  const m = panel.buildPanelMessage();
  assert.equal(m.components.length, 2);
  assert.ok(m.components.every((r) => r.components.length <= 5));
  const ids = m.components.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((i) => i.length <= 100 && i.startsWith('nv:role:')));
});

test('/panel-role: hanya dev/admin', async () => {
  const mk = (roles) => {
    const out = [];
    return {
      out,
      member: { id: 'x', guild: { ownerId: 'o' }, roles: { cache: { has: (id) => roles.includes(id) } } },
      reply: async (x) => out.push(x.content),
    };
  };
  const mod = mk(['m']);
  await panelCmd.execute(mod);
  assert.match(mod.out[0], /khusus admin/);
});

test('modlog: diff role dan bentuk embed', () => {
  assert.deepEqual(diffRoles(['a', 'b'], ['b', 'c']), { added: ['c'], removed: ['a'] });
  const now = Date.UTC(2026, 9, 25);
  const fresh = joinEmbed({ id: '1', tag: 'x#1', createdMs: now - 2 * 86_400_000, memberCount: 10, now }).data;
  assert.ok(fresh.fields.some((f) => f.name.includes('Akun baru')));
  const old = joinEmbed({ id: '1', tag: 'x#1', createdMs: now - 400 * 86_400_000, memberCount: 10, now }).data;
  assert.ok(!old.fields.some((f) => f.name.includes('Akun baru')));
  assert.match(leaveEmbed({ id: '1', tag: 't', how: 'ban', by: '9' }).data.title, /banned/);
  assert.match(leaveEmbed({ id: '1', tag: 't', how: 'kick' }).data.title, /dikeluarkan/);
  assert.match(leaveEmbed({ id: '1', tag: 't' }).data.title, /keluar/);
  const r = roleEmbed({ id: '1', tag: 't', added: ['r1'], removed: ['r2'], by: '9' }).data;
  assert.equal(r.fields.length, 3);
  const d = deleteEmbed({ channelId: 'c' }).data;
  assert.match(JSON.stringify(d), /tidak diketahui/);
  assert.match(d.footer.text, /tidak dicatat/); // isi pesan tidak pernah dicatat
});

test('sambutan: teks petunjuk mengikuti pengaturan, kartu berupa PNG', async () => {
  const text = buildWelcomeText({ id: '42' });
  assert.match(text, /<@42> Welcome to "NEVER DIE"/);
  assert.match(text, /<#RULES>/);
  assert.match(text, /<#ROLES>/);
  assert.match(text, /<#AI1>/);
  assert.doesNotMatch(text, /<#AI2>/);
  const png = await renderWelcomeCard({ username: 'tester', avatar: null, memberNo: 5 });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(png.length > 5000);
});
