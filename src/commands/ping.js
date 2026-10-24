import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder().setName('ping').setDescription('Cek bot hidup');

export async function execute(interaction) {
  return interaction.reply({ content: `Pong! ${Math.round(interaction.client.ws.ping)} ms`, flags: MessageFlags.Ephemeral });
}
