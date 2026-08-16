/* ============================================================
   commands/autoresponder.js
   Gestión del autoresponder por mención (contextos dm/server).

   Subcomandos:
     autoresponder                     → estado actual
     autoresponder on | off            → activar/desactivar (ctx actual)
     autoresponder list                → lista de respuestas (ctx actual)
     autoresponder add <mensaje>       → agregar respuesta
     autoresponder remove <n>          → quitar por índice (1-based)
     autoresponder select <n>          → elegir respuesta activa
     autoresponder rotate on | off     → rotación automática
     autoresponder dm <sub>            → forzar contexto DM
     autoresponder server <sub>        → forzar contexto servidor
   ============================================================ */

import * as ar from '../utils/autoresponder.js';
import { sendText, truncate } from '../utils/helpers.js';

function ctxLabel(ctx) {
  return ctx === 'dm' ? 'DM' : 'servidor';
}

function formatList(ctx) {
  const list = ar.listMessages(ctx);
  const s = ar.getAR();
  const lines = [`**Autoresponder — ${ctxLabel(ctx)}**`];
  lines.push(`Estado: ${s.enabled[ctx] ? '🟢 activado' : '🔴 desactivado'} · Rotación: ${s.rotate[ctx] ? '🔄 sí' : '⏹️ no'}`);
  lines.push(`Activa: ${list.length ? `${s.currentIndex[ctx] + 1} de ${list.length}` : '— (sin respuestas)'}`);
  if (!list.length) {
    lines.push('', `No hay respuestas. Agrégalas con el comando *add*.`);
    return lines.join('\n');
  }
  lines.push('');
  list.forEach((m, i) => {
    const mark = i === s.currentIndex[ctx] ? '➡️' : ' ';
    lines.push(`${mark} ${i + 1}. ${truncate(m, 140)}`);
  });
  return lines.join('\n');
}

export default {
  name: 'autoresponder',
  aliases: ['ar', 'autoresp'],
  category: 'autoresponder',
  description: 'Autoresponder por mención (DM/servidor).',
  usage: 'autoresponder [on|off|list|add <msg>|remove <n>|select <n>|rotate on|off|dm …|server …]',
  async run(message, args) {
    let ctx = ar.ctxOf(message);
    let rest = args.slice();

    if (rest.length && (rest[0] === 'dm' || rest[0] === 'server')) {
      ctx = rest.shift();
    }

    const sub = (rest.shift() || 'status').toLowerCase();
    const value = rest.join(' ').trim();

    switch (sub) {
      case 'on':
        ar.setEnabled(ctx, true);
        return `🟢 Autoresponder activado en ${ctxLabel(ctx)}.`;

      case 'off':
        ar.setEnabled(ctx, false);
        return `🔴 Autoresponder desactivado en ${ctxLabel(ctx)}.`;

      case 'list':
      case 'lista':
        return formatList(ctx);

      case 'add':
      case 'agregar':
      case 'a':
        if (!value) return `Uso: autoresponder add <mensaje>`;
        const added = ar.addMessage(ctx, value);
        return `✅ Respuesta agregada (${ctxLabel(ctx)}): «${truncate(added, 120)}»`;

      case 'remove':
      case 'quitar':
      case 'rm':
      case 'del':
        if (!value) return `Uso: autoresponder remove <número>`;
        const removed = ar.removeMessage(ctx, value);
        return `🗑️ Respuesta ${value} eliminada (${ctxLabel(ctx)}): «${truncate(removed, 120)}»`;

      case 'select':
      case 'seleccionar':
      case 's':
        if (!value) return `Uso: autoresponder select <número>`;
        const sel = ar.selectMessage(ctx, value);
        return `➡️ Respuesta activa (${ctxLabel(ctx)}): «${truncate(sel, 120)}»`;

      case 'rotate':
      case 'rotacion':
      case 'rotación':
        if (value === 'on') {
          ar.setRotate(ctx, true);
          return `🔄 Rotación activada en ${ctxLabel(ctx)}.`;
        }
        if (value === 'off') {
          ar.setRotate(ctx, false);
          return `⏹️ Rotación desactivada en ${ctxLabel(ctx)}.`;
        }
        return `Uso: autoresponder rotate on|off`;

      case 'status':
      case 'estado':
      default:
        return formatList(ctx);
    }
  },
};
