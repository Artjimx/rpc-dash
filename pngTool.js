/* ============================================================
   pngTool.js — Escalado de imágenes PNG en JavaScript puro.

   Discord exige que los assets de Rich Presence midan al menos
   512x512 px y rechaza el resto. Para no obligar al usuario a
   editar la imagen a mano, este módulo decodifica el PNG, lo escala
   y lo vuelve a codificar.

   Solo PNG: re-encolar un JPEG en planilla sería desproporcionado
   para esto, así que las imágenes que no son PNG se rechazan con un
   mensaje claro. No hay dependencias externas: se usa el zlib que ya
   viene con Node.
   ============================================================ */

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* Canales por tipo de color PNG (spec, sección 11). */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/* ------------------------------------------------------------
   CRC (needed por cada chunk)
   ------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) crc = CRC_TABLE[(crc ^ buf[n]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/* ------------------------------------------------------------
   Decodificación
   ------------------------------------------------------------ */

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/* Deshace los filtros de línea PNG y devuelve RGBA sin comprimir. */
function unfilter(raw, width, height, channels) {
  const bpp = channels;
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const value = raw[pos + x];
      const left = x >= bpp ? out[rowStart + x - bpp] : 0;
      const up = y > 0 ? out[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? out[prevStart + x - bpp] : 0;

      let result;
      switch (filter) {
        case 0: result = value; break;
        case 1: result = value + left; break;
        case 2: result = value + up; break;
        case 3: result = value + ((left + up) >> 1); break;
        case 4: result = value + paeth(left, up, upLeft); break;
        default: throw new Error(`filtro PNG desconocido (${filter})`);
      }
      out[rowStart + x] = result & 0xff;
    }
    pos += stride;
  }
  return out;
}

/** Decodifica un PNG de 8 bits sin intercalar y devuelve RGBA. */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('no es un PNG válido');
  }

  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null;

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4;
  }

  if (!width || !height) throw new Error('el PNG no tiene dimensiones válidas');
  if (bitDepth !== 8) throw new Error(`solo se admite PNG de 8 bits (este es de ${bitDepth})`);
  if (interlace !== 0) throw new Error('no se admite PNG entrelazado (Adam7)');
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`tipo de color PNG no soportado (${colorType})`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const flat = unfilter(raw, width, height, channels);

  /* Normaliza cualquier tipo de color a RGBA. */
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    switch (colorType) {
      case 0: /* gris */
        rgba[d] = rgba[d + 1] = rgba[d + 2] = flat[s];
        rgba[d + 3] = 255;
        break;
      case 2: /* RGB */
        rgba[d] = flat[s]; rgba[d + 1] = flat[s + 1]; rgba[d + 2] = flat[s + 2];
        rgba[d + 3] = 255;
        break;
      case 3: /* paleta */
        if (!palette) throw new Error('PNG con paleta sin PLTE');
        rgba[d] = flat[s] === 255 ? 0 : palette[flat[s] * 3];
        rgba[d + 1] = flat[s] === 255 ? 0 : palette[flat[s] * 3 + 1];
        rgba[d + 2] = flat[s] === 255 ? 0 : palette[flat[s] * 3 + 2];
        rgba[d + 3] = 255;
        break;
      case 4: /* gris + alfa */
        rgba[d] = rgba[d + 1] = rgba[d + 2] = flat[s];
        rgba[d + 3] = flat[s + 1];
        break;
      case 6: /* RGBA */
        rgba[d] = flat[s]; rgba[d + 1] = flat[s + 1];
        rgba[d + 2] = flat[s + 2]; rgba[d + 3] = flat[s + 3];
        break;
      default:
        throw new Error(`tipo de color PNG no soportado (${colorType})`);
    }
  }
  return { width, height, rgba };
}

/* ------------------------------------------------------------
   Codificación
   ------------------------------------------------------------ */

/** Codifica RGBA como PNG de 8 bits (sin filtros: se comprime peor que
    con Paeth, pero el resultado es válido y el código es simple). */
export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  /* bit depth */
  ihdr[9] = 6;  /* RGBA */
  ihdr[10] = 0; /* compression */
  ihdr[11] = 0; /* filter */
  ihdr[12] = 0; /* interlace */

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------
   Escalado
   ------------------------------------------------------------ */

/** Escala por vecino más cercano (nearest-neighbour). */
function scaleNearest(rgba, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    /* Se toma el píxel central del bloque destino para que el
       centrado no sesgue hacia un borde concreto. */
    const srcY = Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / dstW));
      rgba.copy(out, (y * dstW + x) * 4, (srcY * srcW + srcX) * 4, (srcY * srcW + srcX) * 4 + 4);
    }
  }
  return out;
}

/**
 * Escala un PNG hasta que alcance al menos `minSize` en ambos lados,
 * conservando la proporción. Si ya es suficiente devuelve el buffer
 * original sin tocarlo.
 *
 * @returns {{buffer: Buffer, width: number, height: number, scaled: boolean}}
 */
export function ensurePngSize(buffer, minSize = 512) {
  const image = decodePng(buffer);
  if (image.width >= minSize && image.height >= minSize) {
    return { buffer, width: image.width, height: image.height, scaled: false };
  }

  const ratio = Math.max(minSize / image.width, minSize / image.height);
  const width = Math.max(minSize, Math.round(image.width * ratio));
  const height = Math.max(minSize, Math.round(image.height * ratio));

  const scaled = scaleNearest(image.rgba, image.width, image.height, width, height);
  return { buffer: encodePng(width, height, scaled), width, height, scaled: true };
}