import { SlashCommandBuilder } from 'discord.js';
import { musicGuard, eph } from './music-util.js';

export const data = new SlashCommandBuilder().setName('skip').setDescription('Lewati lagu yang sedang diputar');

export async function execute(interaction, { music }) {
  const err = musicGuard(interaction, music, { needPlaying: true });
  if (err) return interaction.reply(eph(err));
  const r = await music.skip(interaction.guildId);
  return interaction.reply({ content: `⏭️ Dilewati: **${r.skipped.title}**`, allowedMentions: { parse: [] } });
}
