import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { config } from '../config.js';
import { getTier, isStaffTier, formatLimit } from '../tier.js';
import { askWithFallback, AiError, fitDiscord } from '../ai.js';

const lastUse = new Map(); // userId -> timestamp ms (jeda antar permintaan)
const noMentions = { parse: [] };

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

// Tombol di bawah jawaban: 👍 👎 (nilai) dan 🔄 (jawab ulang). Setelah dinilai, hanya 🔄 tersisa.
export function feedbackRow(id, { rated = false } = {}) {
  const row = new ActionRowBuilder();
  if (!rated) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`nv:up:${id}`).setEmoji('👍').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`nv:down:${id}`).setEmoji('👎').setStyle(ButtonStyle.Secondary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`nv:redo:${id}`)
      .setEmoji('🔄')
      .setLabel('Jawab ulang')
      .setStyle(ButtonStyle.Secondary),
  );
  return row;
}

export async function execute(interaction, ctx) {
  const question = interaction.options.getString('pertanyaan', true);
  return handleAsk(interaction, ctx, question);
}

// Dipakai bersama oleh /ask dan tombol 🔄 (redo = true).
export async function handleAsk(interaction, ctx, question, { redo = false } = {}) {
  const { usage, memory, askLog, limiter, alerter } = ctx;

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

  // 3) Antrean penuh? Tolak sebelum mengambil jatah.
  if (limiter.waiting >= config.ai.maxQueue) {
    return interaction.reply({
      content: 'Antrean AI lagi penuh. Coba lagi sebentar lagi ya.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // 4) Jatah harian (atomik, tersimpan di database)
  const slot = usage.tryConsume(interaction.user.id, tier, limits.daily, config.limits.globalDaily);
  if (!slot.ok) {
    const msg =
      slot.reason === 'global'
        ? 'Kuota AI untuk seluruh server hari ini sudah habis. Coba lagi besok ya.'
        : `Jatah AI kamu hari ini sudah habis (${slot.used}/${formatLimit(slot.limit)}). Reset tengah malam WITA.`;
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
  }
  lastUse.set(interaction.user.id, now);

  if (redo) await interaction.deferUpdate();
  else await interaction.deferReply();

  if (limiter.active >= limiter.max) {
    await interaction
      .editReply({
        content: `⏳ Lagi antre, ada ${limiter.active + limiter.waiting} permintaan di depanmu...`,
        components: [],
        allowedMentions: noMentions,
      })
      .catch(() => {});
  }

  const mode = config.ai.technicalChannelIds.includes(interaction.channelId) ? 'teknis' : 'umum';
  const base = {
    userId: interaction.user.id,
    channelId: interaction.channelId,
    tier,
    mode,
    question,
  };

  let t0 = Date.now();
  try {
    const model = isStaffTier(tier) ? config.ai.modelStaff : config.ai.modelMember;
    const history = memory.history(interaction.user.id, interaction.channelId);
    const { text, model: usedModel } = await limiter.run(() => {
      t0 = Date.now(); // waktu jawab dihitung tanpa waktu antre
      return askWithFallback({
        model,
        fallback: config.ai.fallbackModel,
        question,
        maxTokens: limits.maxTokens,
        history,
        mode,
      });
    });
    const latencyMs = Date.now() - t0;

    if (!redo) memory.add(interaction.user.id, interaction.channelId, question, text);
    const id = askLog.add({ ...base, model: usedModel, ok: true, latencyMs });
    alerter.success();

    const footer = `\n\n-# Jatah hari ini: ${slot.used}/${formatLimit(slot.limit)}`;
    return interaction.editReply({
      content: fitDiscord(text) + footer,
      components: [feedbackRow(id)],
      allowedMentions: noMentions,
    });
  } catch (err) {
    // Gagal: kembalikan jatah dan jangan bocorkan detail teknis ke member.
    usage.refund(interaction.user.id, slot.day);
    lastUse.delete(interaction.user.id);
    const code = err instanceof AiError ? err.message : 'unknown';
    console.error(`[ask] gagal (${code})`);
    askLog.add({ ...base, model: null, ok: false, error: code });
    alerter.failure(code);
    const friendly =
      code === 'timeout'
        ? 'AI terlalu lama menjawab. Jatah kamu dikembalikan, coba lagi sebentar lagi.'
        : 'AI sedang tidak tersedia. Jatah kamu dikembalikan, coba lagi nanti.';
    return interaction.editReply({ content: friendly, components: [], allowedMentions: noMentions });
  }
}
