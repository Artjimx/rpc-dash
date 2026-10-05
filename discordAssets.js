/* ============================================================
   discordAssets.js — Registro automático de imágenes en una
   Discord Application (Rich Presence → Art Assets).

   El usuario solo pega una URL o sube un archivo; este módulo se
   encarga de descargarlo y subirlo a
   POST /applications/{application_id}/assets con el USER_TOKEN,
   que es el único flujo que Discord acepta para poner una imagen
   personalizada en la tarjeta RPC.

   La tarjeta RPC no acepta URLs: large_image / small_image deben ser
   el NOMBRE de un asset registrado en la aplicación. El proxy "mp:"
   solo sirve para embeds, no para la Presence.
   ============================================================ */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const API_BASE = 'https://discord.com/api/v10';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

/* Discord exige que los assets de Rich Presence tengan al menos
   512x512 px: por debajo los rechaza al subir. */
export const MIN_ASSET_SIZE = 512;

/* Discord rechaza assets grandes con mala calidad en la Presence.
   Avisamos, pero no bloqueamos: el Developer Portal acepta hasta
   varios MB. */
export const IDEAL_ASSET_BYTES = 256 * 1024;

/* ------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------ */

/* Identidad estable de una fuente (URL o archivo local) para saber si
   ya está subida y no repetir la subida en cada guardado automático. */
export function sourceKey(appId, slot, value) {
  return crypto
    .createHash('sha1')
    .update(`${appId}|${slot}|${String(value)}`)
    .digest('hex');
}

/* Discord acepta nombres con caracteres alfanuméricos, '_', '-' y '.'.
   Se antepone 'rpc' para que nunca empiece por dígito y se añade un
   hash corto para que dos imágenes distintas no colisionen. */
export function buildAssetName(slot, sourceHash) {
  const kind = slot === 'small' ? 'sm' : 'lg';
  return `rpc_${kind}_${sourceHash.slice(0, 12)}`;
}

function sniffMime(buffer) {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 &&
      buffer.toString('ascii', 4, 8) === 'ftyp' &&
      /avif|avis/.test(buffer.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

/* ------------------------------------------------------------
   Dimensiones (para avisar del mínimo 512x512 de Discord)
   ------------------------------------------------------------ */

function pngSize(b) {
  if (b.length < 24) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function gifSize(b) {
  if (b.length < 10) return null;
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function jpegSize(b) {
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    /* SOF0..SOF15 salvo marcadores que no son SOF */
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (i + 4 > b.length) break;
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function webpSize(b) {
  if (b.length < 30) return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return { width: w, height: h };
  }
  if (chunk === 'VP8 ') {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** @returns {{width:number,height:number}|null} */
export function imageSize(buffer, mime) {
  try {
    if (mime === 'image/png') return pngSize(buffer);
    if (mime === 'image/gif') return gifSize(buffer);
    if (mime === 'image/jpeg') return jpegSize(buffer);
    if (mime === 'image/webp') return webpSize(buffer);
  } catch {
    return null;
  }
  return null;
}

/* ------------------------------------------------------------
   Descarga de la imagen
   ------------------------------------------------------------ */

/* Si el usuario subió el archivo con el dashboard, ya está en disco:
   se lee de ahí en lugar de Making un HTTP a uno mismo. */
function localUploadPath(value, uploadDir) {
  let pathname = value;
  try {
    pathname = new URL(value).pathname;
  } catch {
    /* no es URL absoluta: se trata como ruta relativa /uploads/... */
  }
  const m = /^\/?uploads\/([A-Za-z0-9._-]+)$/.exec(pathname);
  if (!m) return null;
  const filename = path.basename(m[1]);
  if (filename !== m[1]) return null;
  return path.join(uploadDir, filename);
}

/**
 * Obtiene el binario de una imagen desde una URL https o desde una
 * subida local del dashboard.
 * @returns {Promise<{buffer: Buffer, mime: string, filename: string} | null>}
 */
export async function loadImageBuffer(value, { uploadDir } = {}) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  const localPath = uploadDir ? localUploadPath(v, uploadDir) : null;
  if (localPath) {
    try {
      const buffer = await fs.readFile(localPath);
      const mime = sniffMime(buffer);
      if (!mime) throw new Error('el archivo no es una imagen válida');
      if (buffer.length > MAX_IMAGE_BYTES) throw new Error('la imagen supera los 10 MB');
      return { buffer, mime, filename: path.basename(localPath) };
    } catch (err) {
      throw new Error(`no se pudo leer la subida local (${err.message})`);
    }
  }

  if (!/^https:\/\//i.test(v)) {
    throw new Error('solo se admiten URLs https o imágenes subidas desde el dashboard');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(v, { signal: ctrl.signal, redirect: 'follow' });
  } catch (err) {
    throw new Error(err.name === 'AbortError'
      ? 'la descarga de la imagen tardó demasiado'
      : `no se pudo descargar la imagen (${err.message})`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`la URL de la imagen respondió ${res.status}`);

  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > MAX_IMAGE_BYTES) throw new Error('la imagen supera los 10 MB');

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('la imagen supera los 10 MB');

  const mime = sniffMime(buffer) || String(res.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\//i.test(mime)) throw new Error('la URL no apunta a una imagen');

  return { buffer, mime, filename: `imagen${MIME_EXT[mime] || '.png'}` };
}

/* ------------------------------------------------------------
   Subida a la Discord Application
   ------------------------------------------------------------ */

function describeErrors(payload) {
  const errors = payload && payload.errors;
  if (!errors || typeof errors !== 'object') return '';

  const parts = [];
  for (const [field, detail] of Object.entries(errors)) {
    /* Discord anida los fallos de un campo en { _errors: [...] } */
    const list = Array.isArray(detail && detail._errors)
      ? detail._errors
      : (Array.isArray(detail) ? detail : [detail]);

    const msgs = list
      .map((d) => {
        if (d && typeof d === 'object') {
          if (typeof d.message === 'string' && d.message) return d.message;
          if (typeof d.code === 'string' && d.code) return d.code;
          return JSON.stringify(d);
        }
        return String(d);
      })
      .filter(Boolean);

    parts.push(`${field}: ${msgs.join(', ')}`);
  }
  return parts.join(' | ');
}

function friendlyError(status, payload) {
  const discordMessage = String((payload && payload.message) || '').trim();
  const detail = describeErrors(payload);

  if (status === 400) {
    /* 50035 "Invalid Form Body" sin detalle:Discord no dice qué campo
       falla, así que se da la pista más probable. */
    if (!detail) return 'Discord rechazó el cuerpo de la petición (400/50035) sin detallar el campo';
    return `Discord rechazó el asset (400/50035) — ${detail}`;
  }
  if (status === 401) return 'el USER_TOKEN fue rechazado por Discord (401)';
  if (status === 403) {
    return 'tu cuenta no es propietaria de esa aplicación (403): el Application ID debe ser de una app creada por ti';
  }
  if (status === 404) return 'no existe esa aplicación (404): revisa el Application ID';
  if (status === 429) return 'Discord está limitando las subidas por ahora (429), reintenta en unos segundos';
  if (status >= 500) return `Discord devolvió un error ${status}, reintenta más tarde`;
  return `Discord respondió ${status}${detail ? ` — ${detail}` : discordMessage ? `: ${discordMessage}` : ''}`;
}

/**
 * Sube una imagen a los Art Assets de la aplicación.
 *
 * Discord NO acepta multipart aquí: el endpoint de assets de Rich
 * Presence es /oauth2/applications/{id}/assets y espera JSON con la
 * imagen en base64. Con multipart devolvía 400 "Invalid Form Body".
 *
 * @returns {Promise<{id: string, name: string}>} el asset creado
 */
export async function uploadApplicationAsset({ token, appId, name, buffer, mime, filename }) {
  if (!token) throw new Error('no hay USER_TOKEN configurado');
  if (!isSnowflake(appId)) throw new Error('el Application ID no tiene un formato válido');

  const size = imageSize(buffer, mime);
  if (size && (size.width < MIN_ASSET_SIZE || size.height < MIN_ASSET_SIZE)) {
    throw new Error(
      `la imagen es de ${size.width}x${size.height} y Discord exige un mínimo de ${MIN_ASSET_SIZE}x${MIN_ASSET_SIZE} px`,
    );
  }

  const body = JSON.stringify({
    image: `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`,
    name,
    type: 1,
  });

  const res = await fetch(`${API_BASE}/oauth2/applications/${appId}/assets`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body,
  });

  let payload = null;
  const text = await res.text();
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }

  if (!res.ok) throw new Error(friendlyError(res.status, payload));

  /* Discord devuelve el asset como objeto; algunos endpoints lo
     envuelven en un array. Se aceptan ambas formas. */
  const asset = Array.isArray(payload) ? payload[0] : payload;
  const created = (asset && (Array.isArray(asset.assets) ? asset.assets[0] : asset)) || null;

  if (!created || typeof created !== 'object') {
    throw new Error('Discord confirmó la subida pero no devolvió el asset creado');
  }

  const finalName = String(created.name || name);
  if (!finalName) throw new Error('Discord confirmó la subida pero sin nombre de asset');

  return { id: String(created.id || ''), name: finalName };
}

/* Borra el asset anterior cuando se reemplaza la imagen. Si falla no
   pasa nada: solo dejaría un asset huérfano en el Developer Portal. */
export async function deleteApplicationAsset({ token, appId, assetId }) {
  if (!token || !assetId || !isSnowflake(appId)) return false;
  if (!/^[A-Za-z0-9._/-]{1,64}$/.test(assetId)) return false;
  try {
    const res = await fetch(`${API_BASE}/oauth2/applications/${appId}/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isSnowflake(value) {
  return /^[0-9]{17,20}$/.test(String(value || '').trim());
}