/* ============================================================
   utils/humanize.js
   Manejo dinámico de rate limits de Discord (HTTP 429).
   Lee el header Retry-After y pausa automáticamente.
   Sin delays artificiales, sin salt, sin typing simulation.
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
