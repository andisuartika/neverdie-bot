import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { eph } from './music-util.js';
import { fmtDuration } from '../music/queue.js';
import { config } from '../config.js';

export const data = new SlashCommandBuilder().setName('queue').setDescription('Lihat lagu yang sedang diputar dan antrean');

export async function execute(interaction, { music }) {
  if (!config.music.enabled || !music) return interaction.reply(eph('Fitur musik belum diaktifkan.'));
  const st = music.state(interaction.guildId);
  if (!st?.queue.current) return interaction.reply(eph('Tidak ada lagu yang sedang diputar.'));
  const cur = st.queue.current;
  const lines = st.queue.items
    .slice(0, 10)
    .map((t, i) => `${i + 1}. ${t.title.slice(0, 80)} (${fmtDuration(t.length)})`)
    .join('\n');
  const more = st.queue.size > 10 ? `\n…dan ${st.queue.size - 10} lagu lagi` : '';
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('🎵 Antrean musik')
    .addFields(
      { name: 'Sedang diputar', value: `**${cur.title.slice(0, 120)}** (${fmtDuration(cur.length)})\nDiminta oleh <@${cur.requester}>` },
      { name: `Berikutnya (${st.queue.size})`, value: lines ? lines + more : 'Kosong' },
    )
    .setFooter({ text: `Volume ${st.volume}%` });
  return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}
