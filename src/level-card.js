import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const regularFont = path.join(root, 'assets', 'fonts', 'Montserrat-Regular.ttf');
const boldFont = path.join(root, 'assets', 'fonts', 'Montserrat-Bold.ttf');
const WIDTH = 934;
const HEIGHT = 282;

let fontsReady = false;

async function canvasApi() {
  const api = await import('@napi-rs/canvas');
  if (!fontsReady) {
    api.GlobalFonts.registerFromPath(regularFont, 'Montserrat');
    api.GlobalFonts.registerFromPath(boldFont, 'Montserrat Bold');
    fontsReady = true;
  }
  return api;
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function cover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

async function loadRemoteImage(url, loadImage) {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32 || bytes.length > 4_000_000) return null;
    return await loadImage(bytes);
  } catch {
    return null;
  }
}

export function levelCardBackgroundPath() {
  for (const name of ['level-card-bg.png', 'level-card-bg.jpg']) {
    const file = path.join(root, 'assets', name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

async function loadBackground(loadImage) {
  const file = levelCardBackgroundPath();
  if (file) {
    try { return await loadImage(file); } catch { /* własne tło jest opcjonalne */ }
  }
  const url = process.env.LEVEL_CARD_BG_URL?.trim();
  return loadRemoteImage(url, loadImage);
}

export async function renderLevelCardPng({ displayName, username, level, progress, needed, avatarUrl, avatarImage } = {}) {
  const { createCanvas, loadImage } = await canvasApi();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const name = String(displayName || username || 'Gracz').slice(0, 32);
  const handle = String(username || 'uzytkownik').replace(/^@/, '').slice(0, 32);
  const current = Math.max(0, Number(progress) || 0);
  const total = Math.max(1, Number(needed) || 1);
  const ratio = Math.max(0, Math.min(1, current / total));

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  roundRect(ctx, 1, 1, WIDTH - 2, HEIGHT - 2, 28);
  ctx.save();
  ctx.clip();

  const background = await loadBackground(loadImage);
  if (background) {
    cover(ctx, background, WIDTH, HEIGHT);
    ctx.fillStyle = 'rgba(8, 6, 22, 0.72)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else {
    const sky = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    sky.addColorStop(0, '#241047');
    sky.addColorStop(0.55, '#120a2e');
    sky.addColorStop(1, '#0b1d4a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  ctx.fillStyle = '#d8b4fe';
  ctx.font = '600 18px Montserrat';
  ctx.fillText('STREFA GRY I ROZRYWKI  ·  LEVEL SYSTEM', 36, 42);

  const avatar = avatarImage || await loadRemoteImage(avatarUrl, loadImage);
  const ax = 118;
  const ay = 158;
  const ar = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax - ar, ay - ar, ar * 2, ar * 2);
  else {
    ctx.fillStyle = '#3b176b';
    ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
    ctx.fillStyle = '#f5e9ff';
    ctx.font = '700 42px "Montserrat Bold"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.trim().charAt(0).toUpperCase() || '?', ax, ay + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ax, ay, ar + 3, 0, Math.PI * 2);
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 40px "Montserrat Bold"';
  ctx.fillText(name, 210, 118);
  ctx.fillStyle = '#ddd6fe';
  ctx.font = '500 22px Montserrat';
  ctx.fillText(`Profil: @${handle}`, 210, 156);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5e9ff';
  ctx.font = '700 64px "Montserrat Bold"';
  ctx.fillText(String(level), 890, 132);
  ctx.font = '600 16px Montserrat';
  ctx.fillStyle = '#c4b5fd';
  ctx.fillText('LEVEL', 890, 78);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#e9d5ff';
  ctx.font = '600 18px Montserrat';
  ctx.fillText('Postęp poziomu', 210, 198);
  ctx.textAlign = 'right';
  ctx.fillText(`${current.toLocaleString('pl-PL')} / ${total.toLocaleString('pl-PL')} XP`, 890, 198);
  ctx.textAlign = 'left';

  const barX = 210;
  const barY = 214;
  const barW = 680;
  const barH = 22;
  roundRect(ctx, barX, barY, barW, barH, 11);
  ctx.fillStyle = '#1e1038';
  ctx.fill();
  if (ratio > 0) {
    ctx.save();
    roundRect(ctx, barX, barY, Math.max(barH, barW * ratio), barH, 11);
    ctx.clip();
    const glow = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    glow.addColorStop(0, '#7c3aed');
    glow.addColorStop(1, '#c026d3');
    ctx.shadowColor = '#c026d3';
    ctx.shadowBlur = 18;
    ctx.fillStyle = glow;
    ctx.fillRect(barX, barY, barW * ratio, barH);
    ctx.restore();
  }

  ctx.font = '600 16px Montserrat';
  ctx.fillStyle = '#ddd6fe';
  ctx.fillText(`Poziom ${level}`, 210, 260);
  ctx.textAlign = 'right';
  ctx.fillText(`Następny: Poziom ${Number(level) + 1}`, 890, 260);
  ctx.textAlign = 'left';

  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#a855f7';
  roundRect(ctx, 1, 1, WIDTH - 2, HEIGHT - 2, 28);
  ctx.stroke();
  return canvas.toBuffer('image/png');
}
