/* ============================================================
   utils/triggerStore.js
   Autoresponder por disparador (trigger → respuesta).
   Cada entrada: { id, trigger, response, enabled }.
   Persiste en data/triggers.json.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'triggers.json');

let data = { enabled: true, entries: [] };
let _loaded = false;

function load() {
  if (_loaded) return;
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (raw && typeof raw === 'object') {
        data.enabled = raw.enabled !== false;
        data.entries = Array.isArray(raw.entries) ? raw.entries : [];
      }
    }
  } catch (e) { /* defaults */ }
  _loaded = true;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { /* noop */ }
}

export function isEnabled() { load(); return data.enabled; }
export function setEnabled(v) { load(); data.enabled = !!v; save(); }
export function getEntries() { load(); return data.entries; }

export function addEntry(trigger, response) {
  load();
  const id = data.entries.length + 1;
  data.entries.push({ id, trigger: trigger.trim(), response: response.trim(), enabled: true });
  save();
  return data.entries[data.entries.length - 1];
}

export function removeEntry(idOrIndex) {
  load();
  const n = Number(idOrIndex);
  // buscar por id
  let idx = data.entries.findIndex((e) => e.id === n);
  if (idx === -1) idx = n - 1; // fallback: índice 1-based
  if (idx < 0 || idx >= data.entries.length) return null;
  const removed = data.entries.splice(idx, 1)[0];
  save();
  return removed;
}

export function findMatch(text) {
  load();
  if (!data.enabled) return null;
  const lower = String(text || '').toLowerCase();
  for (const e of data.entries) {
    if (!e.enabled) continue;
    if (lower.includes(e.trigger.toLowerCase())) return e;
  }
  return null;
}

export function toggleEntry(id, enabled) {
  load();
  const e = data.entries.find((x) => x.id === id);
  if (!e) return null;
  e.enabled = enabled;
  save();
  return e;
}
