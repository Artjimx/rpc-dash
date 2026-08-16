/* ============================================================
   utils/logger.js
   Logger ligero con prefijo [CMD] y colores ANSI.
   ============================================================ */

const RESET = '\x1b[0m';
const C = {
  info: '\x1b[36m',
  ok: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  dim: '\x1b[2m',
};

function ts() {
  return new Date().toLocaleTimeString('es', { hour12: false });
}

function write(level, color, ...args) {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(`[CMD] ${C.dim}${ts()}${RESET} ${color}[${level.toUpperCase()}]${RESET} ${msg}`);
}

export const log = {
  info: (...a) => write('info', C.info, ...a),
  ok: (...a) => write('ok', C.ok, ...a),
  warn: (...a) => write('warn', C.warn, ...a),
  error: (...a) => write('error', C.error, ...a),
};
