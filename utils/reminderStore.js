/* ============================================================
   utils/reminderStore.js
   Almacén persistente de reminders (data/reminders.json).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'reminders.json');

let reminders = [];
let nextId = 1;

export function loadReminders() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (Array.isArray(raw.list)) reminders = raw.list;
      if (raw.nextId) nextId = raw.nextId;
    }
  } catch (e) { /* usa defaults */ }
  return reminders;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ list: reminders, nextId }, null, 2), 'utf8');
  } catch (e) { /* noop */ }
}

export function addReminder({ userId, channelId, guildId, text, fireAt }) {
  const r = { id: nextId++, userId, channelId, guildId, text, fireAt, created: Date.now() };
  reminders.push(r);
  save();
  return r;
}

export function removeReminder(id) {
  const idx = reminders.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const [removed] = reminders.splice(idx, 1);
  save();
  return removed;
}

export function getPending() {
  return reminders.filter((r) => r.fireAt > Date.now());
}

export function getExpired() {
  return reminders.filter((r) => r.fireAt <= Date.now());
}

export function popExpired() {
  const now = Date.now();
  const expired = reminders.filter((r) => r.fireAt <= now);
  reminders = reminders.filter((r) => r.fireAt > now);
  if (expired.length) save();
  return expired;
}

export function getUserReminders(userId) {
  return reminders.filter((r) => r.userId === userId && r.fireAt > Date.now());
}

export function cancelUserReminder(userId, id) {
  const idx = reminders.findIndex((r) => r.id === id && r.userId === userId);
  if (idx === -1) return null;
  const [removed] = reminders.splice(idx, 1);
  save();
  return removed;
}

export function parseDuration(str) {
  const m = str.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 's') return n * 1000;
  if (unit === 'm') return n * 60000;
  if (unit === 'h') return n * 3600000;
  if (unit === 'd') return n * 86400000;
  return null;
}
