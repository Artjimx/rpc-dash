/* ============================================================
   utils/humanize.js
   Rate limiting adaptativo para respuestas del selfbot.
   - awaitRateLimit: pausa dinámica al recibir HTTP 429.
   - throttle: gap mínimo entre mensajes del bot por canal
     (500–800ms, adaptativo según actividad reciente).
   Sin delays artificiales innecesarios, sin salt, sin typing.
   ============================================================ */

/**
 * Si el error es un 429, espera el tiempo indicado por Retry-After.
 * Devuelve true si manejó el rate limit, false si era otro error.
 */
export async function awaitRateLimit(error) {
  if (!error) return false;
  const status = error.status || error.httpStatus || (error.response && error.response.status);
  if (status !== 429) return false;

  const retryAfter = error.retry_after || (error.headers && error.headers['retry-after']) || 2;
  const ms = Math.ceil(Number(retryAfter) * 1000) || 2000;
  await new Promise((r) => setTimeout(r, ms));
  return true;
}

/* --- Throttle adaptativo por canal --- */

const _lastSend = new Map();
const _burst = new Map();

const MIN_GAP = 500;
const BURST_WINDOW = 8000;
const BURST_LIMIT = 4;
const BURST_EXTRA = 300;

function channelKey(channel) {
  return channel && channel.id ? channel.id : '_';
}

export async function throttle(channel) {
  const key = channelKey(channel);
  const now = Date.now();
  const last = _lastSend.get(key) || 0;
  const gap = now - last;

  if (gap < MIN_GAP) {
    await new Promise((r) => setTimeout(r, MIN_GAP - gap));
  }

  const timestamps = _burst.get(key) || [];
  const recent = timestamps.filter((t) => Date.now() - t < BURST_WINDOW);
  if (recent.length >= BURST_LIMIT) {
    await new Promise((r) => setTimeout(r, BURST_EXTRA));
  }
  recent.push(Date.now());
  _burst.set(key, recent);

  _lastSend.set(key, Date.now());
  if (_burst.size > 200) {
    for (const [k, v] of _burst) {
      if (v.length < 2) _burst.delete(k);
    }
  }
}
