import { SlashCommandBuilder } from 'discord.js';
import { musicGuard, eph } from './music-util.js';

export const data = new SlashCommandBuilder().setName('pause').setDescription('Jeda atau lanjutkan musik');

export async function execute(interaction, { music }) {
  const err = musicGuard(interaction, music, { needPlaying: true });
  if (err) return interaction.reply(eph(err));
  const r = await music.togglePause(interaction.guildId);
  return interaction.reply(r.paused ? '⏸️ Dijeda. Ketik `/pause` lagi untuk melanjutkan.' : '▶️ Dilanjutkan.');
}
