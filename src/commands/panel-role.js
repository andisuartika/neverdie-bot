import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getTier } from '../tier.js';
import { buildPanelMessage, ensureRoles } from '../panel.js';

export const data = new SlashCommandBuilder()
  .setName('panel-role')
  .setDescription('Kirim panel tombol ambil role ke channel ini (khusus dev/admin)');

export async function execute(interaction) {
  const tier = getTier(interaction.member);
  if (tier !== 'dev' && tier !== 'admin') {
    return interaction.reply({ content: 'Perintah ini khusus admin.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { created, problems } = await ensureRoles(interaction.guild);
  try {
    await interaction.channel.send(buildPanelMessage());
  } catch (err) {
    return interaction.editReply(`Gagal mengirim panel di channel ini: ${err?.message ?? err}. Pastikan NV Bot boleh Kirim Pesan dan Sematkan Tautan di sini.`);
  }
  const lines = ['Panel terkirim di channel ini.'];
  if (created.length) lines.push(`Role baru dibuat: ${created.join(', ')}.`);
  if (problems.length) lines.push('Perlu perhatian:', ...problems.map((p) => `• ${p}`));
  return interaction.editReply(lines.join('\n'));
}
