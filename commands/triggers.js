/* ============================================================
   commands/triggers.js
   Autoresponder por disparador (trigger → respuesta).

   Subcomandos:
     triggers                    → estado y lista
     triggers on | off           → activar/desactivar todo
     triggers add <trigger> | <respuesta>
     triggers remove <id|n>      → eliminar
     triggers on <id>            → activar entrada
     triggers off <id>           → desactivar entrada
   ============================================================ */

import * as ts from '../utils/triggerStore.js';
import { truncate } from '../utils/helpers.js';

function formatList() {
  const entries = ts.getEntries();
  const enabled = ts.isEnabled();
  const lines = ['**Triggers — Autoresponder por disparador**'];
  lines.push(`Estado: ${enabled ? '🟢 activado' : '🔴 desactivado'} · Entradas: ${entries.length}`);
  if (!entries.length) {
    lines.push('', 'No hay triggers. Agrégalos con: `$tr add <trigger> | <respuesta>`');
    return lines.join('\n');
  }
  lines.push('');
  for (const e of entries) {
    const status = e.enabled ? '🟢' : '🔴';
    const ch = e.channelId ? ` <#${e.channelId}>` : '';
    lines.push(`${status} **${e.id}.** «${truncate(e.trigger, 40)}» → «${truncate(e.response, 60)}»${ch}`);
  }
  return lines.join('\n');
}

const triggers = {
  name: 'triggers',
  aliases: ['tr', 'trigger'],
  category: 'autoresponder',
  description: 'Autoresponder por disparador: cuando alguien escribe algo, el bot responde.',
  usage: 'triggers [on|off|add <trigger>|<respuesta>|remove <id>|on <id>|off <id>]',
  async run(message, args) {
    const sub = (args[0] || '').toLowerCase();
    const rest = args.slice(1).join(' ').trim();

    switch (sub) {
      case 'on': {
        if (!rest) { ts.setEnabled(true); return '🟢 Triggers activados.'; }
        const id = Number(rest);
        const e = ts.toggleEntry(id, true);
        if (!e) return 'Entrada no encontrada.';
        return `🟢 Trigger **${e.id}** activado: «${truncate(e.trigger, 40)}»`;
      }
      case 'off': {
        if (!rest) { ts.setEnabled(false); return '🔴 Triggers desactivados.'; }
        const id = Number(rest);
        const e = ts.toggleEntry(id, false);
        if (!e) return 'Entrada no encontrada.';
        return `🔴 Trigger **${e.id}** desactivado: «${truncate(e.trigger, 40)}»`;
      }
      case 'list':
      case 'lista':
      case 'status':
        return formatList();

      case 'add':
      case 'agregar':
      case 'a': {
        const raw = args.slice(1).join(' ');
        const sep = raw.indexOf('|');
        if (sep === -1) return 'Formato: `$tr add <trigger> | <respuesta>`';
        const trigger = raw.slice(0, sep).trim();
        const response = raw.slice(sep + 1).trim();
        if (!trigger || !response) return 'Faltan el trigger o la respuesta.';
        const channelId = message.channel.id;
        const entry = ts.addEntry(trigger, response, channelId);
        return `✅ Trigger **${entry.id}** creado en <#${channelId}>: «${truncate(trigger, 40)}» → «${truncate(response, 60)}»`;
      }

      case 'remove':
      case 'quitar':
      case 'rm':
      case 'del': {
        if (!rest) return 'Uso: `$tr remove <id>`';
        const removed = ts.removeEntry(rest);
        if (!removed) return 'Entrada no encontrada.';
        return `🗑️ Trigger eliminado: «${truncate(removed.trigger, 40)}»`;
      }

      default:
        return formatList();
    }
  },
};

export default [triggers];
