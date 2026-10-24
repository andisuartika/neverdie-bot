import { SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { musicGuard, canControl, eph } from './music-util.js';

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Atur volume musik')
  .addIntegerOption((o) =>
    o.setName('persen').setDescription(`0 sampai ${config.music.maxVolume}`).setRequired(true).setMinValue(0).setMaxValue(config.music.maxVolume),
  );

export async function execute(interaction, { music }) {
  const err = musicGuard(interaction, music, { needPlaying: true });
  if (err) return interaction.reply(eph(err));
  if (!canControl(interaction, music.state(interaction.guildId))) {
    return interaction.reply(eph('Hanya staf atau yang meminta lagu ini yang bisa mengubah volume.'));
  }
  const r = await music.setVolume(interaction.guildId, interaction.options.getInteger('persen', true));
  return interaction.reply(`🔊 Volume: **${r.volume}%**`);
}
