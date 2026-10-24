import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { getTier, isStaffTier, formatLimit } from '../tier.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Statistik pemakaian AI hari ini (khusus staf)');

// Dipisah dari execute() supaya mudah diuji.
export function buildStatsEmbedData(s, { globalUsed, globalLimit }) {
  const failed = s.total - s.ok;
  const failPct = s.total ? Math.round((failed / s.total) * 100) : 0;
  const rated = s.up + s.down;
  const fields = [
    { name: 'Permintaan', value: `${s.total} (berhasil ${s.ok}, gagal ${failed} = ${failPct}%)`, inline: true },
    { name: 'Pengguna unik', value: String(s.users), inline: true },
    { name: 'Rata-rata waktu jawab', value: s.avg_ms ? `${(s.avg_ms / 1000).toFixed(1)} detik` : '-', inline: true },
    { name: 'Kuota global (non-staf)', value: `${globalUsed}/${formatLimit(globalLimit)}`, inline: true },
    { name: 'Penilaian', value: rated ? `👍 ${s.up}  👎 ${s.down}` : 'Belum ada', inline: true },
    {
      name: 'Pemakai teratas',
      value: s.top.length ? s.top.map((t, i) => `${i + 1}. <@${t.user_id}>: ${t.n}`).join('\n') : '-',
    },
  ];
  if (s.errors.length) {
    fields.push({ name: 'Kode gagal', value: s.errors.map((e) => `\`${e.error}\` ×${e.n}`).join('\n') });
  }
  return { title: `Statistik AI, ${s.day}`, fields };
}

export async function execute(interaction, { usage, askLog }) {
  if (!isStaffTier(getTier(interaction.member))) {
    return interaction.reply({ content: 'Perintah ini khusus staf.', flags: MessageFlags.Ephemeral });
  }
  const { title, fields } = buildStatsEmbedData(askLog.stats(), {
    globalUsed: usage.globalToday(),
    globalLimit: config.limits.globalDaily,
  });
  const embed = new EmbedBuilder().setTitle(title).addFields(fields).setColor(0x57f287);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}
