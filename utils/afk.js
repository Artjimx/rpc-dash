/* ============================================================
   utils/afk.js
   Estado AFK persistente (data/afk.json).
   - .afk [motivo] lo activa; cualquier mensaje propio lo quita.
   - Al estar AFK se responde (1 vez por usuario cada 10 min):
     en DM con cualquier mensaje y en servidores por mención.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'afk.json');
const NOTIFY_WINDOW_MS = 10 * 60 * 1000;

let state = { active: false, reason: '', since: 0, notified: {} };

export function loadAFK() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (raw && typeof raw === 'object') state = { ...state, ...raw };
    }
  } catch (e) { /* usa defaults */ }
  return state;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) { /* noop */ }
}

export function isAFK() {
  loadAFK();
  return state.active;
}

export function getAFK() {
  loadAFK();
  return state;
}

export function setAFK(reason) {
  state.active = true;
  state.reason = String(reason || 'Estoy AFK').slice(0, 128);
  state.since = Date.now();
  state.notified = {};
  save();
  return state;
}

export function clearAFK() {
  if (!state.active) return false;
  state.active = false;
  state.reason = '';
  state.notified = {};
  save();
  return true;
}

/* true = hay que responderle a este usuario (no fue notificado hace poco). */
export function shouldNotify(userId) {
  const now = Date.now();
  const last = state.notified[userId];
  if (last && now - last < NOTIFY_WINDOW_MS) return false;
  state.notified[userId] = now;
  save();
  return true;
}

export function sinceText() {
  if (!state.since) return '';
  const s = Math.max(0, Math.floor((Date.now() - state.since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
