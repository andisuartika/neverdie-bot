import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { getTier, isStaffTier, formatLimit } from '../tier.js';
import { askAI, AiError, fitDiscord } from '../ai.js';

const lastUse = new Map(); // userId -> timestamp ms (jeda antar permintaan)

export const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Tanya AI NEVER DIE (ada batas pemakaian harian)')
  .addStringOption((o) =>
    o
      .setName('pertanyaan')
      .setDescription('Apa yang mau kamu tanyakan?')
      .setRequired(true)
      .setMaxLength(config.ai.maxQuestionChars),
  );

export async function execute(interaction, { usage, memory }) {
  const noMentions = { parse: [] };

  // 1) Hanya di channel yang diizinkan
  if (config.aiChannelIds.length && !config.aiChannelIds.includes(interaction.channelId)) {
    const where = config.aiChannelIds.map((id) => `<#${id}>`).join(', ');
    return interaction.reply({
      content: `Perintah ini hanya bisa dipakai di ${where}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: noMentions,
    });
  }

  const tier = getTier(interaction.member);
  const limits = config.limits[tier];

  // 2) Jeda antar permintaan
  const now = Date.now();
  const wait = (lastUse.get(interaction.user.id) ?? 0) + limits.cooldownSec * 1000 - now;
  if (wait > 0) {
    return interaction.reply({
      content: `Tunggu ${Math.ceil(wait / 1000)} detik lagi ya.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 3) Jatah harian (atomik, tersimpan di database)
  const slot = usage.tryConsume(interaction.user.id, tier, limits.daily, config.limits.globalDaily);
  if (!slot.ok) {
    const msg =
      slot.reason === 'global'
        ? 'Kuota AI untuk seluruh server hari ini sudah habis. Coba lagi besok ya.'
        : `Jatah AI kamu hari ini sudah habis (${slot.used}/${slot.limit}). Reset tengah malam WITA.`;
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
  }
  lastUse.set(interaction.user.id, now);

  await interaction.deferReply();

  try {
    const question = interaction.options.getString('pertanyaan', true);
    const model = isStaffTier(tier) ? config.ai.modelStaff : config.ai.modelMember;
    const mode = config.ai.technicalChannelIds.includes(interaction.channelId) ? 'teknis' : 'umum';
    const history = memory.history(interaction.user.id, interaction.channelId);
    const answer = await askAI({ model, question, maxTokens: limits.maxTokens, history, mode });
    memory.add(interaction.user.id, interaction.channelId, question, answer);
    const footer = `\n\n-# Jatah hari ini: ${slot.used}/${formatLimit(slot.limit)}`;
    return interaction.editReply({
      content: fitDiscord(answer) + footer,
      allowedMentions: noMentions,
    });
  } catch (err) {
    // Gagal: kembalikan jatah dan jangan bocorkan detail teknis ke member.
    usage.refund(interaction.user.id, slot.day);
    lastUse.delete(interaction.user.id);
    const code = err instanceof AiError ? err.message : 'unknown';
    console.error(`[ask] gagal (${code})`);
    const friendly =
      code === 'timeout'
        ? 'AI terlalu lama menjawab. Jatah kamu dikembalikan, coba lagi sebentar lagi.'
        : 'AI sedang tidak tersedia. Jatah kamu dikembalikan, coba lagi nanti.';
    return interaction.editReply({ content: friendly, allowedMentions: noMentions });
  }
}
