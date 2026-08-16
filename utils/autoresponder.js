/* ============================================================
   utils/autoresponder.js
   Gestor de datos del autoresponder (por mención, no por keyword).
   - Contextos independientes: dm y server.
   - Modo: rotación automática o selección activa (currentIndex).
   - Persistencia en data/autoresponder.json.
   Formato:
   {
     "enabled": { "dm": true, "server": true },
     "rotate": { "dm": true, "server": false },
     "currentIndex": { "dm": 0, "server": 0 },
     "messages": { "dm": [...], "server": [...] }
   }
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'autoresponder.json');

const DEFAULTS = {
  enabled: { dm: true, server: true },
  rotate: { dm: true, server: false },
  currentIndex: { dm: 0, server: 0 },
  messages: { dm: [], server: [] },
};

let state = null;

function normalize(s) {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  if (!s || typeof s !== 'object') return out;
  for (const ctx of ['dm', 'server']) {
    if (s.enabled && typeof s.enabled[ctx] === 'boolean') out.enabled[ctx] = s.enabled[ctx];
    if (s.rotate && typeof s.rotate[ctx] === 'boolean') out.rotate[ctx] = s.rotate[ctx];
    if (s.currentIndex && Number.isInteger(s.currentIndex[ctx])) out.currentIndex[ctx] = s.currentIndex[ctx];
    if (Array.isArray(s.messages && s.messages[ctx])) {
      out.messages[ctx] = s.messages[ctx].filter((m) => typeof m === 'string' && m.trim()).slice(0, 50);
    }
  }
  return out;
}

export function loadAR() {
  if (state) return state;
  let raw = {};
  try {
    if (fs.existsSync(FILE)) raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) { /* usa defaults */ }
  state = normalize(raw);
  return state;
}

export function saveAR() {
  if (!state) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) { /* noop */ }
}

export function getAR() {
  return state || loadAR();
}

export function ctxOf(message) {
  return message && message.guild ? 'server' : 'dm';
}

export function isEnabled(ctx) {
  return !!getAR().enabled[ctx];
}

export function setEnabled(ctx, value) {
  getAR().enabled[ctx] = !!value;
  saveAR();
  return getAR().enabled[ctx];
}

export function isRotating(ctx) {
  return !!getAR().rotate[ctx];
}

export function setRotate(ctx, value) {
  getAR().rotate[ctx] = !!value;
  saveAR();
  return getAR().rotate[ctx];
}

export function listMessages(ctx) {
  return getAR().messages[ctx] || [];
}

export function addMessage(ctx, text) {
  const s = getAR();
  const t = String(text).trim();
  if (!t) throw new Error('El mensaje no puede estar vacío.');
  if ((s.messages[ctx] || []).length >= 50) throw new Error('Máximo 50 respuestas por contexto.');
  s.messages[ctx].push(t);
  saveAR();
  return t;
}

export function removeMessage(ctx, index) {
  const s = getAR();
  const list = s.messages[ctx] || [];
  const idx = Number(index) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
    throw new Error(`Índice inválido (usa 1-${list.length}).`);
  }
  const removed = list.splice(idx, 1)[0];
  if (s.currentIndex[ctx] >= list.length && list.length > 0) s.currentIndex[ctx] = list.length - 1;
  if (list.length === 0) s.currentIndex[ctx] = 0;
  saveAR();
  return removed;
}

export function selectMessage(ctx, index) {
  const s = getAR();
  const list = s.messages[ctx] || [];
  const idx = Number(index) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
    throw new Error(`Índice inválido (usa 1-${list.length}).`);
  }
  s.currentIndex[ctx] = idx;
  saveAR();
  return list[idx];
}

/* Devuelve la respuesta a enviar según el modo activo.
   Si rota, avanza el índice y lo persiste. */
export function nextResponse(ctx) {
  const s = getAR();
  if (!s.enabled[ctx]) return null;
  const list = s.messages[ctx] || [];
  if (!list.length) return null;
  if (s.rotate[ctx]) {
    const idx = s.currentIndex[ctx] % list.length;
    s.currentIndex[ctx] = (idx + 1) % list.length;
    saveAR();
    return { text: list[idx], index: idx };
  }
  const idx = Math.min(s.currentIndex[ctx], list.length - 1);
  return { text: list[idx], index: idx };
}

export function summary() {
  const s = getAR();
  return {
    enabled: { ...s.enabled },
    rotate: { ...s.rotate },
    currentIndex: { ...s.currentIndex },
    counts: { dm: s.messages.dm.length, server: s.messages.server.length },
  };
}
