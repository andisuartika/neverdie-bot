import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reset')
  .setDescription('Hapus ingatan percakapan AI milikmu (mulai topik baru)');

export async function execute(interaction, { memory }) {
  const n = memory.clear(interaction.user.id);
  return interaction.reply({
    content: n ? 'Ingatan percakapanmu sudah dihapus. Kita mulai dari awal.' : 'Belum ada percakapan yang diingat.',
    flags: MessageFlags.Ephemeral,
  });
}
