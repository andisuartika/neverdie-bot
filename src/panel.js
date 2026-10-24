import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { suppress } from './suppress.js';

// Role yang boleh diambil sendiri oleh member. Dicocokkan lewat nama (tanpa emoji/simbol),
// jadi "💻 Programmer" cocok dengan "programmer". Tidak ada ID role yang disimpan.
export const PANEL_GROUPS = [
  {
    title: 'Minat Programmer',
    roles: [
      { key: 'prog', emoji: '💻', name: 'Programmer', color: 0x3498db },
      { key: 'mobile', emoji: '📱', name: 'Mobile Dev', color: 0x2ecc71 },
      { key: 'web', emoji: '🌐', name: 'Web Dev', color: 0xe67e22 },
    ],
  },
  {
    title: 'Game',
    roles: [
      { key: 'fps', emoji: '🎯', name: 'FPS Player', color: 0xe74c3c },
      { key: 'mgame', emoji: '📱', name: 'Mobile Gamer', color: 0x9b59b6 },
      { key: 'chill', emoji: '🌿', name: 'Santai & Survival', color: 0x1abc9c },
    ],
  },
];
export const PANEL_ROLES = PANEL_GROUPS.flatMap((g) => g.roles);

export const normalizeName = (n) =>
  n
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.MentionEveryone,
];

// Role dengan izin berbahaya tidak pernah boleh diberikan lewat tombol.
export const isSafeRole = (role) => !DANGEROUS.some((p) => role.permissions.has(p));

export const findRole = (guild, def) =>
  guild.roles.cache.find((r) => normalizeName(r.name) === normalizeName(def.name));

export function buildPanelMessage() {
  const embed = new EmbedBuilder()
    .setTitle('Ambil Role')
    .setColor(0x5865f2)
    .setDescription('Klik tombol untuk **mengambil**, klik lagi untuk **melepas**. Role dipakai untuk melihat channel dan notifikasi sesuai minatmu.')
    .addFields(
      PANEL_GROUPS.map((g) => ({
        name: g.title,
        value: g.roles.map((r) => `${r.emoji} ${r.name}`).join('\n'),
        inline: true,
      })),
    );
  const components = PANEL_GROUPS.map((g) =>
    new ActionRowBuilder().addComponents(
      g.roles.map((r) =>
        new ButtonBuilder()
          .setCustomId(`nv:role:${r.key}`)
          .setEmoji(r.emoji)
          .setLabel(r.name)
          .setStyle(ButtonStyle.Secondary),
      ),
    ),
  );
  return { embeds: [embed], components };
}

// Dipanggil oleh staf lewat /panel-role: pastikan semua role ada (buat yang belum ada).
export async function ensureRoles(guild) {
  const created = [];
  const problems = [];
  for (const def of PANEL_ROLES) {
    let role = findRole(guild, def);
    if (!role) {
      try {
        role = await guild.roles.create({
          name: `${def.emoji} ${def.name}`,
          color: def.color,
          mentionable: false,
          permissions: [],
          reason: 'Panel role NV Bot',
        });
        created.push(role.name);
      } catch {
        problems.push(`${def.name}: belum ada dan bot tidak bisa membuatnya (butuh izin Manage Roles)`);
        continue;
      }
    }
    if (!isSafeRole(role)) problems.push(`${role.name}: punya izin berbahaya, tidak akan dipakai di panel`);
    else if (!role.editable) problems.push(`${role.name}: posisi role NV Bot harus di atas role ini`);
  }
  return { created, problems };
}

export async function handleRoleButton(interaction) {
  const key = interaction.customId.split(':')[2];
  const reply = (content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

  const def = PANEL_ROLES.find((d) => d.key === key);
  if (!def) return reply('Tombol ini sudah tidak berlaku.');
  const role = findRole(interaction.guild, def);
  if (!role) return reply('Role ini belum disiapkan. Hubungi staf.');
  if (!isSafeRole(role) || !role.editable) return reply('Role ini tidak bisa diatur lewat panel. Hubungi staf.');

  const member = interaction.member;
  const has = member.roles.cache.has(role.id);
  suppress.mark(member.id, role.id);
  try {
    if (has) await member.roles.remove(role, 'Panel role');
    else await member.roles.add(role, 'Panel role');
  } catch (err) {
    console.error('[panel] gagal mengubah role:', err?.message ?? err);
    suppress.consume(member.id, role.id);
    return reply('Gagal mengubah role. Coba lagi nanti atau hubungi staf.');
  }
  return reply(has ? `➖ Role **${role.name}** dilepas.` : `➕ Role **${role.name}** ditambahkan.`);
}
