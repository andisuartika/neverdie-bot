import { AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { config } from './config.js';

const FONT_FILES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
];
const fontPath = FONT_FILES.find(existsSync);
if (fontPath) GlobalFonts.registerFromPath(fontPath, 'NVBold');
const FONT = fontPath ? 'NVBold' : 'sans-serif';

export const TAGLINE = 'GAMER NEVER DIE WE RESPAWN';

// Memotong teks agar muat lebar tertentu.
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// Kartu sambutan 900x300: avatar bulat dengan cincin neon, WELCOME, nama, slogan.
export async function renderWelcomeCard({ username, avatar, memberNo }) {
  const W = 900, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Latar gradasi gelap + titik halus
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(1, '#1a1040');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(120,160,255,0.08)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 197) % W, y = (i * 89) % H;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  // Garis aksen
  const accent = ctx.createLinearGradient(0, 0, W, 0);
  accent.addColorStop(0, '#22d3ee');
  accent.addColorStop(1, '#a855f7');
  ctx.fillStyle = accent;
  ctx.fillRect(0, H - 8, W, 8);

  // Avatar bulat
  const cx = 150, cy = 150, r = 88;
  ctx.save();
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 24;
  ctx.lineWidth = 8;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#334';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `bold 90px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((username[0] || '?').toUpperCase(), cx, cy + 4);
  }
  ctx.restore();

  // Teks
  const tx = 285;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 64px ${FONT}`;
  ctx.fillText('WELCOME', tx, 130);

  ctx.fillStyle = '#facc15';
  ctx.font = `bold 38px ${FONT}`;
  ctx.fillText(fit(ctx, username, W - tx - 40), tx, 185);

  ctx.fillStyle = '#9db4ff';
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(TAGLINE, tx, 228);
  if (memberNo) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(`Member #${memberNo}`, tx, 258);
  }
  return canvas.toBuffer('image/png');
}

async function loadAvatar(member) {
  try {
    const url = member.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

// Teks di atas gambar. Petunjuk hanya muncul untuk channel yang diisi di .env.
export function buildWelcomeText(member, cfg = config) {
  const lines = [`Hi, <@${member.id}> Welcome to "NEVER DIE". 🎉`];
  const tips = [];
  if (cfg.rulesChannelId) tips.push(`📜 Baca aturan di <#${cfg.rulesChannelId}>`);
  tips.push('🧭 Atur minatmu lewat **Channels & Roles** (di atas daftar channel)');
  if (cfg.rolesChannelId) tips.push(`🏷️ Ambil role di <#${cfg.rolesChannelId}>`);
  if (cfg.aiChannelIds[0]) tips.push(`🤖 Tanya AI di <#${cfg.aiChannelIds[0]}> pakai \`/ask\``);
  return `${lines[0]}\n${tips.join('\n')}`;
}

export async function sendWelcome(client, member) {
  if (!config.welcomeChannelId || member.user.bot) return;
  const channel = await client.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const png = await renderWelcomeCard({
    username: member.displayName || member.user.username,
    avatar: await loadAvatar(member),
    memberNo: member.guild.memberCount,
  });
  await channel.send({
    content: buildWelcomeText(member),
    files: [new AttachmentBuilder(png, { name: 'welcome.png' })],
    allowedMentions: { users: [member.id] },
  });
}
