import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { getTier, formatLimit } from '../tier.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Cara memakai NV Bot dan batas pemakaian AI');

const TIER_LABEL = {
  dev: 'Dev',
  admin: 'Admin',
  moderator: 'Moderator',
  programmer: 'Programmer',
  member: 'Member',
};

// Dipisah dari execute() supaya mudah diuji tanpa Discord.
export function buildHelpFields({ tier, used, cfg = config }) {
  const where = cfg.aiChannelIds.length
    ? cfg.aiChannelIds.map((id) => `<#${id}>`).join(', ')
    : 'channel mana saja';
  const mine = cfg.limits[tier];

  const rows = Object.keys(TIER_LABEL)
    .map((t) => {
      const l = cfg.limits[t];
      const mark = t === tier ? ' ← kamu' : '';
      return `**${TIER_LABEL[t]}**: ${formatLimit(l.daily)}/hari${mark}`;
    })
    .join('\n');

  return {
    description: 'Asisten komunitas NEVER DIE. Tanya soal game, kuliah, atau coding.',
    fields: [
      {
        name: 'Perintah',
        value: [
          `\`/ask\` tanya AI (di ${where})`,
          '`/reset` hapus ingatan percakapan, mulai topik baru',
          '`/usage` lihat sisa jatah hari ini',
          '`/ping` cek bot hidup',
          ...(cfg.music?.enabled
            ? ['`/play` `/skip` `/pause` `/queue` `/volume` `/stop` musik YouTube (masuk voice dulu)']
            : []),
        ].join('\n'),
      },
      {
        name: 'Jatah AI per hari',
        value: `${rows}\n\nJatahmu hari ini: **${used}/${formatLimit(mine.daily)}**. Reset tengah malam WITA.`,
      },
      {
        name: 'Tips',
        value: [
          `• Bot mengingat ${cfg.memory.turns} tanya-jawab terakhir selama ${cfg.memory.ttlMin} menit, jadi pertanyaan lanjutan nyambung. Pakai \`/reset\` kalau ganti topik.`,
          `• Pertanyaan maksimal ${cfg.ai.maxQuestionChars} karakter. Untuk error kode, tempel potongan pentingnya dan sebut bahasa atau versinya.`,
          '• Jawaban AI bisa keliru. Cek lagi untuk hal penting.',
          '• Kalau AI gagal menjawab, jatahmu otomatis dikembalikan.',
        ].join('\n'),
      },
    ],
  };
}

export async function execute(interaction, { usage }) {
  const tier = getTier(interaction.member);
  const { description, fields } = buildHelpFields({
    tier,
    used: usage.usedToday(interaction.user.id),
  });
  const embed = new EmbedBuilder()
    .setTitle('NV Bot')
    .setDescription(description)
    .addFields(fields)
    .setColor(0x5865f2);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
