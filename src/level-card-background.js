import { createHash } from 'node:crypto';

export const LEVEL_CARD_BG_MAX_BYTES = 4 * 1024 * 1024;

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function imageFormat(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(PNG)) return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function validateLevelCardImage(input) {
  if (!input || typeof input.data !== 'string') throw new Error('Wybierz plik PNG, JPG lub WebP.');
  const compact = input.data.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length > Math.ceil(LEVEL_CARD_BG_MAX_BYTES / 3) * 4) {
    throw new Error('Zdjęcie może mieć maksymalnie 4 MB.');
  }
  const bytes = Buffer.from(compact, 'base64');
  if (!bytes.length || bytes.length > LEVEL_CARD_BG_MAX_BYTES) throw new Error('Zdjęcie może mieć maksymalnie 4 MB.');
  const format = imageFormat(bytes);
  if (!format) throw new Error('Plik nie jest poprawnym obrazem PNG, JPG ani WebP.');
  return { ...format, bytes, data: bytes.toString('base64') };
}

export function chooseLevelCardBackground({ stored, file, url } = {}) {
  if (stored) return 'guild';
  if (file) return 'file';
  if (url) return 'url';
  return 'gradient';
}

function hashSeed(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.codePointAt(0), 16777619);
  return seed >>> 0;
}

function rng(seed) {
  let state = seed || 1;
  return () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296);
}

function plain(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function backgroundTheme(description) {
  const text = plain(String(description || ''));
  const palette = text.includes('czerwon') ? ['#3b0a0a', '#7f1d1d', '#fb7185']
    : text.includes('zielon') ? ['#052e1a', '#14532d', '#4ade80']
    : text.includes('zlot') ? ['#3b2a08', '#854d0e', '#facc15']
    : text.includes('rozow') ? ['#3b0a2a', '#9d174d', '#f9a8d4']
    : text.includes('niebies') ? ['#0b1d4a', '#1d4ed8', '#67e8f9']
    : ['#1a0538', '#4c1d95', '#e879f9'];
  const motif = text.includes('minecraft') || text.includes('piksel') ? 'pixels'
    : text.includes('miasto') || text.includes('cyber') ? 'city'
    : text.includes('ogien') ? 'fire'
    : text.includes('kosmos') || text.includes('gwiazd') ? 'stars'
    : 'stars';
  return { palette, motif, seed: hashSeed(text || 'strefa') };
}

export async function proceduralBackground(description) {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { palette, motif, seed } = backgroundTheme(description);
  const random = rng(seed);
  const canvas = createCanvas(934, 282);
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 934, 282);
  sky.addColorStop(0, palette[1]);
  sky.addColorStop(1, palette[0]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 934, 282);
  if (motif === 'pixels') {
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = random() > 0.5 ? palette[2] : palette[1];
      ctx.globalAlpha = 0.35 + random() * 0.4;
      ctx.fillRect(Math.floor(random() * 58) * 16, Math.floor(random() * 18) * 16, 16, 16);
    }
  } else if (motif === 'city') {
    ctx.strokeStyle = palette[2];
    ctx.globalAlpha = 0.25;
    for (let x = 0; x < 934; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 282); ctx.stroke(); }
    for (let y = 0; y < 282; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(934, y); ctx.stroke(); }
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 18; i++) {
      const w = 30 + random() * 50;
      const h = 40 + random() * 140;
      ctx.fillStyle = random() > 0.4 ? palette[0] : palette[1];
      ctx.fillRect(random() * 934, 282 - h, w, h);
    }
  } else if (motif === 'fire') {
    const glow = ctx.createRadialGradient(467, 240, 10, 467, 240, 280);
    glow.addColorStop(0, palette[2]);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 934, 282);
  } else {
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.25 + random() * 0.75;
      ctx.beginPath();
      ctx.arc(random() * 934, random() * 282, random() * 1.8 + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return canvas.toBuffer('image/png');
}

export async function generateLevelBackground(description, fetchImpl = fetch) {
  const prompt = String(description ?? '').trim();
  if (!prompt || prompt.length > 400) throw new Error('Opis tła może mieć od 1 do 400 znaków.');
  const openai = process.env.OPENAI_API_KEY?.trim();
  const xai = process.env.XAI_API_KEY?.trim();
  if (openai || xai) {
    try {
      const remote = await externalBackground(prompt, { openai, xai, fetchImpl });
      if (remote && imageFormat(remote)) return remote;
    } catch (error) {
      console.warn('Generowanie tła przez API nie powiodło się, używam wzoru:', error.message);
    }
  }
  return proceduralBackground(prompt);
}

async function externalBackground(prompt, { openai, xai, fetchImpl }) {
  if (openai) {
    const response = await fetchImpl('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'dall-e-2', prompt: prompt.slice(0, 900), size: '512x512', response_format: 'b64_json' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('OpenAI odrzucił generowanie tła.');
    const body = await response.json();
    const data = body.data?.[0]?.b64_json;
    if (data) return Buffer.from(data, 'base64');
  }
  if (xai) {
    const response = await fetchImpl('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${xai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'grok-2-image', prompt: prompt.slice(0, 900), response_format: 'b64_json' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('xAI odrzucił generowanie tła.');
    const body = await response.json();
    const data = body.data?.[0]?.b64_json;
    if (data) return Buffer.from(data, 'base64');
  }
  return null;
}

export function rememberBackground(state, guildId, { bytes, mime, source, draft = true }) {
  state.levelCardBackgrounds ??= {};
  const current = state.levelCardBackgrounds[guildId] ?? {};
  const image = { data: bytes.toString('base64'), mime, source };
  if (draft) {
    state.levelCardBackgrounds[guildId] = { ...current, draft: image };
    return state.levelCardBackgrounds[guildId];
  }
  const version = (current.saved?.version ?? current.version ?? 0) + 1;
  state.levelCardBackgrounds[guildId] = { saved: { ...image, version }, draft: null, version };
  return state.levelCardBackgrounds[guildId];
}

export function resetBackground(state, guildId) {
  state.levelCardBackgrounds ??= {};
  const version = (state.levelCardBackgrounds[guildId]?.version ?? 0) + 1;
  state.levelCardBackgrounds[guildId] = { saved: null, draft: null, version };
  return state.levelCardBackgrounds[guildId];
}

export function activeBackground(record) {
  return record?.draft?.data ? record.draft : record?.saved?.data ? record.saved : null;
}

export function backgroundFingerprint(record) {
  const saved = record?.saved;
  if (!saved?.data) return `0:${record?.version ?? 0}`;
  return `${saved.version ?? 0}:${createHash('sha256').update(saved.data).digest('hex').slice(0, 16)}`;
}
