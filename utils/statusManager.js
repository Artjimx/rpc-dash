/* ============================================================
   utils/statusManager.js
   Texto de estado persistente (data/status_persist.json).
   NOTA: este módulo NO toca la presencia de Discord porque la
   presencia la gestiona el RPC (dashboard). Solo guarda un texto
   de estado configurable para plugins/uso futuro.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'status_persist.json');

let text = '';

export function initStatusManager(client, config) {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (raw && typeof raw.text === 'string') text = raw.text;
    }
  } catch (e) { /* usa vacío */ }
  if (config && config.status) text = String(config.status);
  if (text) log.info(`Estado persistido: «${text}»`);
  return { client };
}

export function getStatus() {
  return text;
}

export function applyStatus(client, newText) {
  text = String(newText || '').trim();
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ text, updatedAt: Date.now() }, null, 2), 'utf8');
  } catch (e) { /* noop */ }
  /* No se aplica a la presencia: el RPC del dashboard la controla. */
  return text;
}
