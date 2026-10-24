import { AuditLogEvent, EmbedBuilder, Events } from 'discord.js';
import { config } from './config.js';
import { suppress } from './suppress.js';

const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;
const NEW_ACCOUNT_DAYS = 7;

// ---- Bentuk pesan (murni, mudah diuji) ----
export function diffRoles(oldIds, newIds) {
  const o = new Set(oldIds), n = new Set(newIds);
  return {
    added: [...n].filter((id) => !o.has(id)),
    removed: [...o].filter((id) => !n.has(id)),
  };
}

export function joinEmbed({ id, tag, createdMs, memberCount, now = Date.now() }) {
  const ageDays = Math.floor((now - createdMs) / 86_400_000);
  const e = new EmbedBuilder()
    .setTitle('📥 Member bergabung')
    .setColor(0x57f287)
    .setDescription(`<@${id}> (${tag})`)
    .addFields(
      { name: 'Akun dibuat', value: ts(createdMs), inline: true },
      { name: 'Total member', value: String(memberCount), inline: true },
    )
    .setFooter({ text: `ID ${id}` });
  if (ageDays < NEW_ACCOUNT_DAYS) e.addFields({ name: '⚠️ Akun baru', value: `Umur akun ${ageDays} hari` });
  return e;
}

export function leaveEmbed({ id, tag, joinedMs, roleIds = [], how = 'keluar', by = null }) {
  const title = how === 'ban' ? '🔨 Member dibanned' : how === 'kick' ? '👢 Member dikeluarkan' : '📤 Member keluar';
  const e = new EmbedBuilder()
    .setTitle(title)
    .setColor(how === 'keluar' ? 0xfee75c : 0xed4245)
    .setDescription(`<@${id}> (${tag})`)
    .setFooter({ text: `ID ${id}` });
  if (joinedMs) e.addFields({ name: 'Bergabung', value: ts(joinedMs), inline: true });
  if (by) e.addFields({ name: 'Oleh', value: `<@${by}>`, inline: true });
  if (roleIds.length) e.addFields({ name: 'Role', value: roleIds.slice(0, 15).map((r) => `<@&${r}>`).join(' ') });
  return e;
}

export function roleEmbed({ id, tag, added, removed, by = null }) {
  const e = new EmbedBuilder()
    .setTitle('🏷️ Role diubah')
    .setColor(0x5865f2)
    .setDescription(`<@${id}> (${tag})`)
    .setFooter({ text: `ID ${id}` });
  if (added.length) e.addFields({ name: 'Ditambah', value: added.map((r) => `<@&${r}>`).join(' ') });
  if (removed.length) e.addFields({ name: 'Dilepas', value: removed.map((r) => `<@&${r}>`).join(' ') });
  if (by) e.addFields({ name: 'Oleh', value: `<@${by}>` });
  return e;
}

export function deleteEmbed({ channelId, authorId = null, authorTag = null, createdMs = null, attachments = 0, by = null }) {
  const e = new EmbedBuilder()
    .setTitle('🗑️ Pesan dihapus')
    .setColor(0xeb459e)
    .addFields({ name: 'Channel', value: `<#${channelId}>`, inline: true });
  e.addFields({ name: 'Pengirim', value: authorId ? `<@${authorId}> (${authorTag ?? '?'})` : 'tidak diketahui', inline: true });
  if (createdMs) e.addFields({ name: 'Dikirim', value: ts(createdMs), inline: true });
  if (attachments) e.addFields({ name: 'Lampiran', value: String(attachments), inline: true });
  if (by) e.addFields({ name: 'Dihapus oleh', value: `<@${by}>`, inline: true });
  e.setFooter({ text: 'Isi pesan tidak dicatat' });
  return e;
}

// ---- Audit log (usaha terbaik; abaikan bila bot tidak punya izin View Audit Log) ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function executorOf(guild, type, targetId, windowMs = 10_000) {
  try {
    await sleep(1500); // entri audit tiba sedikit setelah event
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const hit = logs.entries.find((e) => e.target?.id === targetId && Date.now() - e.createdTimestamp < windowMs);
    return hit?.executor?.id ?? null;
  } catch {
    return null;
  }
}

// ---- Pemasangan ke client ----
export function registerModLog(client, { welcome }) {
  const send = async (embed) => {
    if (!config.staffLogChannelId) return;
    try {
      const ch = await client.channels.fetch(config.staffLogChannelId);
      await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (err) {
      console.error('[modlog] gagal kirim:', err?.message ?? err);
    }
  };
  const guard = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error('[modlog] error:', err?.message ?? err);
    }
  };
  const ours = (guildId) => guildId === config.discord.guildId;

  // Pesan dihapus: tidak butuh intent privileged. Isi pesan memang tidak tersedia/tidak dicatat.
  client.on(Events.MessageDelete, guard(async (m) => {
    if (!ours(m.guildId) || m.channelId === config.staffLogChannelId) return;
    if (m.author?.bot) return;
    const by = m.author?.id ? await executorOf(m.guild, AuditLogEvent.MessageDelete, m.author.id, 6000) : null;
    await send(deleteEmbed({
      channelId: m.channelId,
      authorId: m.author?.id ?? null,
      authorTag: m.author?.tag ?? null,
      createdMs: m.createdTimestamp ?? null,
      attachments: m.attachments?.size ?? 0,
      by: by && by !== m.author?.id ? by : null,
    }));
  }));

  if (!config.memberEvents) return;

  client.on(Events.GuildMemberAdd, guard(async (member) => {
    if (!ours(member.guild.id)) return;
    await send(joinEmbed({
      id: member.id,
      tag: member.user.tag,
      createdMs: member.user.createdTimestamp,
      memberCount: member.guild.memberCount,
    }));
    await welcome(member);
  }));

  client.on(Events.GuildMemberRemove, guard(async (member) => {
    if (!ours(member.guild.id)) return;
    let how = 'keluar';
    let by = await executorOf(member.guild, AuditLogEvent.MemberBanAdd, member.id);
    if (by) how = 'ban';
    else {
      by = await executorOf(member.guild, AuditLogEvent.MemberKick, member.id);
      if (by) how = 'kick';
    }
    await send(leaveEmbed({
      id: member.id,
      tag: member.user.tag,
      joinedMs: member.joinedTimestamp,
      roleIds: member.partial ? [] : [...member.roles.cache.keys()].filter((r) => r !== member.guild.id),
      how,
      by,
    }));
  }));

  client.on(Events.GuildMemberUpdate, guard(async (oldM, newM) => {
    if (!ours(newM.guild.id) || oldM.partial) return;
    const { added, removed } = diffRoles([...oldM.roles.cache.keys()], [...newM.roles.cache.keys()]);
    // Perubahan dari panel role (oleh bot sendiri) tidak perlu dicatat.
    const a = added.filter((id) => !suppress.consume(newM.id, id));
    const r = removed.filter((id) => !suppress.consume(newM.id, id));
    if (!a.length && !r.length) return;
    const by = await executorOf(newM.guild, AuditLogEvent.MemberRoleUpdate, newM.id);
    await send(roleEmbed({ id: newM.id, tag: newM.user.tag, added: a, removed: r, by }));
  }));
}
