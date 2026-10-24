import { MessageFlags } from 'discord.js';
import { handleAsk, feedbackRow } from './commands/ask.js';

const ID = /^nv:(up|down|redo):(\d+)$/;

// Menangani tombol 👍 👎 🔄 di bawah jawaban. Hanya penanya asli yang boleh menekan.
export async function handleButton(interaction, ctx) {
  const m = ID.exec(interaction.customId);
  if (!m) return;
  const [, action, idStr] = m;
  const id = Number(idStr);
  const row = ctx.askLog.get(id);
  const reply = (content) =>
    interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

  if (!row) return reply('Data jawaban ini sudah tidak ada.');
  if (row.user_id !== interaction.user.id) return reply('Tombol ini hanya untuk yang bertanya.');

  if (action === 'redo') return handleAsk(interaction, ctx, row.question, { redo: true });

  const saved = ctx.askLog.rate(id, interaction.user.id, action === 'up' ? 1 : -1);
  if (!saved) return reply('Penilaian tidak bisa disimpan.');
  await interaction.update({ components: [feedbackRow(id, { rated: true })] });
  return interaction
    .followUp({
      content: action === 'up' ? 'Makasih! Senang bisa membantu 👍' : 'Makasih masukannya, bakal diperbaiki 🙏',
      flags: MessageFlags.Ephemeral,
    })
    .catch(() => {});
}
