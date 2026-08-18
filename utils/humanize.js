/* ============================================================
   utils/humanize.js
   Anti-heurística: delays, typing simulation, salt, circuit breaker.
   Todas las respuestas automáticas pasan por aquí.
   ============================================================ */

/* --- Jitter delay (1500–4000 ms) --- */
export function humanDelay() {
  const ms = Math.floor(Math.random() * 2500 + 1500);
  return new Promise((r) => setTimeout(r, ms));
}

/* --- Salt: 1-3 zero-width spaces al final --- */
export function salt(text) {
  const n = Math.floor(Math.random() * 3) + 1;
  return text + '\u200B'.repeat(n);
}

/* --- Enviar con typing + delay + salt --- */
export async function humanSend(target, content) {
  try {
    await target.sendTyping();
  } catch (e) { /* noop */ }
  await humanDelay();
  return target.send(salt(content));
}

/* --- Reply con typing + delay + salt (preserva referencia) --- */
export async function humanReply(message, content) {
  try {
    await message.channel.sendTyping();
  } catch (e) { /* noop */ }
  await humanDelay();
  return message.reply(salt(content));
}

/* --- Circuit breaker: max auto-sends por ventana --- */
const WINDOW_MS = 10 * 60 * 1000;   // 10 minutos
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos
const MAX_AUTO = 12;                 // max acciones automáticas por ventana

let _autoTimestamps = [];
let _cooldownUntil = 0;

export function canAutoSend() {
  if (Date.now() < _cooldownUntil) return false;
  _prune();
  return _autoTimestamps.length < MAX_AUTO;
}

export function recordAutoSend() {
  _prune();
  _autoTimestamps.push(Date.now());
  if (_autoTimestamps.length >= MAX_AUTO) {
    _cooldownUntil = Date.now() + COOLDOWN_MS;
    _autoTimestamps = [];
  }
}

function _prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (_autoTimestamps.length && _autoTimestamps[0] < cutoff) _autoTimestamps.shift();
}

/* --- Delay para purge viejo (1500–3500 ms) --- */
export function purgeDelay() {
  const ms = Math.floor(Math.random() * 2000 + 1500);
  return new Promise((r) => setTimeout(r, ms));
}
