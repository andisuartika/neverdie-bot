import { SlashCommandBuilder } from 'discord.js';
import { musicGuard, eph } from './music-util.js';
import { fmtDuration } from '../music/queue.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Putar musik dari YouTube (judul atau tautan)')
  .addStringOption((o) => o.setName('lagu').setDescription('Judul lagu atau tautan YouTube').setRequired(true).setMaxLength(200));

const REASONS = {
  node_down: 'Pemutar musik sedang tidak tersedia. Coba lagi sebentar lagi.',
  not_youtube: 'Hanya tautan YouTube yang didukung. Atau ketik judul lagunya.',
  bad_url: 'Tautannya tidak valid.',
  empty: 'Lagu tidak ditemukan. Coba judul yang lain.',
  filtered: 'Lagu tidak bisa dimasukkan (siaran langsung atau terlalu panjang).',
  load_error: 'YouTube menolak atau gagal dimuat. Coba lagu lain.',
  no_result: 'Lagu tidak ditemukan.',
  other_channel: 'Bot sedang dipakai di voice channel lain.',
  queue_full: 'Antrean penuh.',
};

export async function execute(interaction, { music }) {
  const err = musicGuard(interaction, music);
  if (err) return interaction.reply(eph(err));
  await interaction.deferReply();
  const r = await music.enqueue({
    guildId: interaction.guildId,
    voiceChannelId: interaction.member.voice.channel.id,
    shardId: interaction.guild.shardId,
    query: interaction.options.getString('lagu', true),
    requester: interaction.user.id,
    textChannelId: interaction.channelId,
  });
  if (!r.ok) return interaction.editReply({ content: REASONS[r.reason] ?? 'Gagal memutar lagu.', allowedMentions: { parse: [] } });
  const t = r.first;
  const skip = r.skipped ? ` (${r.skipped} lagu dilewati: siaran langsung atau terlalu panjang)` : '';
  const head = r.added > 1 ? `Menambahkan **${r.added}** lagu` : r.startsNow ? 'Memutar' : `Masuk antrean #${r.position}`;
  return interaction.editReply({
    content: `🎵 ${head}: **${t.title}** (${fmtDuration(t.length)})${skip}`,
    allowedMentions: { parse: [] },
  });
}
