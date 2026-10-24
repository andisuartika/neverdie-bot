import { SlashCommandBuilder } from 'discord.js';
import { musicGuard, canControl, eph } from './music-util.js';

export const data = new SlashCommandBuilder().setName('stop').setDescription('Hentikan musik, kosongkan antrean, bot keluar dari voice');

export async function execute(interaction, { music }) {
  const err = musicGuard(interaction, music);
  if (err) return interaction.reply(eph(err));
  const st = music.state(interaction.guildId);
  if (!st) return interaction.reply(eph('Tidak ada musik yang sedang diputar.'));
  if (!canControl(interaction, st)) return interaction.reply(eph('Hanya staf atau yang meminta lagu ini yang bisa menghentikan. Pakai `/skip` untuk melewati.'));
  await music.stop(interaction.guildId);
  return interaction.reply('⏹️ Musik dihentikan, antrean dikosongkan.');
}
