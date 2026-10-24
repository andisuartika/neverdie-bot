import { config } from './config.js';

// Tingkat staf: tidak terkena batas global harian dan memakai model staf.
export const STAFF_TIERS = ['dev', 'admin', 'moderator'];
export const isStaffTier = (tier) => STAFF_TIERS.includes(tier);

// Urutan: dev > admin > moderator > programmer > member. Pemilik server = dev.
export function getTier(member) {
  if (!member) return 'member';
  if (member.guild?.ownerId === member.id) return 'dev';
  const has = (ids) => ids.some((id) => member.roles?.cache?.has(id));
  if (has(config.roles.dev)) return 'dev';
  if (has(config.roles.admin)) return 'admin';
  if (has(config.roles.moderator)) return 'moderator';
  if (has(config.roles.programmer)) return 'programmer';
  return 'member';
}

export const formatLimit = (n) => (Number.isFinite(n) ? String(n) : '∞');
