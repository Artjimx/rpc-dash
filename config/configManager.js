/* ============================================================
   config/configManager.js
   Configuración centralizada del selfbot (config/config.json).
   - Carga con defaults si el archivo no existe.
   - Expone un objeto singleton mutable (get/set/save).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'config.json');

const DEFAULTS = {
  prefix: '.',
  ownerId: '',
  status: '',
  embedColor: '#5865F2',
  features: {
    autoresponder: true,
    snipe: true,
    afk: true,
    info: true,
    ai: true,
    plugins: true,
  },
  providers: {},
};

let state = null;

function deepMerge(base, extra) {
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    const out = (base && typeof base === 'object' && !Array.isArray(base)) ? base : {};
    for (const k of Object.keys(extra)) {
      out[k] = deepMerge(base ? base[k] : undefined, extra[k]);
    }
    return out;
  }
  return extra === undefined ? base : extra;
}

export function loadConfig() {
  if (state) return state;
  let file = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      file = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn(`[CONFIG] No se pudo leer config.json: ${e.message}`);
  }
  state = deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), file);
  return state;
}

export function getConfig() {
  return state || loadConfig();
}

export function saveConfig() {
  if (!state) return;
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[CONFIG] No se pudo guardar config.json: ${e.message}`);
  }
}

export function setConfig(keyPath, value) {
  const cfg = getConfig();
  const parts = keyPath.split('.');
  let cur = cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  saveConfig();
  return cfg;
}
