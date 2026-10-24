import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { getTier, formatLimit } from '../tier.js';

export const data = new SlashCommandBuilder()
  .setName('usage')
  .setDescription('Lihat sisa jatah AI kamu hari ini');

export async function execute(interaction, { usage }) {
  const tier = getTier(interaction.member);
  const limit = config.limits[tier].daily;
  const used = usage.usedToday(interaction.user.id);
  return interaction.reply({
    content: `Tingkat: **${tier}**\nJatah AI hari ini: **${used}/${formatLimit(limit)}** (reset tengah malam WITA).`,
    flags: MessageFlags.Ephemeral,
  });
}
