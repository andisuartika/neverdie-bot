import { MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { getTier, isStaffTier } from '../tier.js';

export const eph = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

// Pemeriksaan umum perintah musik. Mengembalikan pesan galat, atau null jika boleh lanjut.
export function musicGuard(interaction, music, { needPlaying = false } = {}) {
  if (!config.music.enabled || !music) return 'Fitur musik belum diaktifkan.';
  const ids = config.music.channelIds;
  if (ids.length && !ids.includes(interaction.channelId) && !isStaffTier(getTier(interaction.member))) {
    return `Pakai perintah musik di ${ids.map((i) => `<#${i}>`).join(', ')}.`;
  }
  const vc = interaction.member?.voice?.channel;
  if (!vc) return 'Masuk dulu ke voice channel, baru pakai perintah ini.';
  const st = music.state(interaction.guildId);
  if (st && st.channelId !== vc.id) return `Bot sedang memutar musik di <#${st.channelId}>. Gabung ke sana dulu.`;
  if (needPlaying && !st?.queue.current) return 'Tidak ada lagu yang sedang diputar.';
  return null;
}

// Hentikan/atur volume: staf atau orang yang meminta lagu saat ini.
export function canControl(interaction, st) {
  return isStaffTier(getTier(interaction.member)) || st?.queue.current?.requester === interaction.user.id;
}
