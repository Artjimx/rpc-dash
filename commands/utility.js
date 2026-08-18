/* ============================================================
   commands/utility.js
   Utilidades: snipe (mensajes eliminados), purge (borra tus
   mensajes con bulkDelete para máxima velocidad).
   ============================================================ */

import { truncate } from '../utils/helpers.js';
import { purgeDelay } from '../utils/humanize.js';

const snipe = {
  name: 'snipe',
  aliases: ['sn'],
  category: 'utilidad',
  description: 'Muestra el último mensaje eliminado en el canal.',
  usage: 'snipe [canal]',
  async run(message) {
    const cache = message.client._snipeCache || new Map();
    const target = message.mentions.channels.first() || message.channel;
    const entry = cache.get(target.id);
    if (!entry) return `No hay mensajes eliminados recientes en ${target.name || 'este canal'}.`;
    const head = `**Snipe en ${target.name || 'canal'}**\n👤 ${entry.author || 'desconocido'} · 🕒 ${new Date(entry.ts).toLocaleTimeString('es')}`;
    let body = entry.content ? truncate(entry.content, 1800) : '*sin contenido*';
    if (entry.attachment) body += `\n🖼️ ${entry.attachment}`;
    return `${head}\n${body}`;
  },
};

const purge = {
  name: 'purge',
  aliases: ['clean'],
  category: 'utilidad',
  description: 'Elimina tus mensajes en el canal (máx. 100, rápido).',
  usage: 'purge [cantidad]',
  async run(message, args) {
    const n = Math.min(Math.max(parseInt(args[0], 10) || 100, 1), 100);
    const channel = message.channel;

    // Auto-borrar el comando del usuario
    try { await message.delete(); } catch (e) { /* noop */ }

    let fetched;
    try {
      fetched = await channel.messages.fetch({ limit: Math.min(n + 10, 100) });
    } catch (e) {
      return `No se pudieron obtener mensajes: ${e.message}`;
    }

    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const own = fetched
      .filter((m) => m.author && m.author.id === message.client.user.id && m.id !== message.id)
      .first(n);

    if (!own.length) return null;

    let removed = 0;

    // bulkDelete para mensajes <14 días (rápido, hasta 100 a la vez)
    const fresh = own.filter((m) => m.createdTimestamp > cutoff);
    const stale = own.filter((m) => m.createdTimestamp <= cutoff);

    if (fresh.length >= 2) {
      try {
        const deleted = await channel.bulkDelete(fresh, true);
        removed += deleted.size;
      } catch (e) {
        // fallback individual
        for (const m of fresh) { try { await m.delete(); removed++; } catch (e2) { /* noop */ } }
      }
    } else {
      for (const m of fresh) { try { await m.delete(); removed++; } catch (e) { /* noop */ } }
    }

    // Mensajes viejos: borrado individual con delay anti-heurística
    for (const m of stale) {
      try {
        await purgeDelay();
        await m.delete();
        removed++;
      } catch (e) { /* noop */ }
    }

    return removed ? `🧹 Purge: eliminados **${removed}** mensajes.` : null;
  },
};

export default [snipe, purge];
