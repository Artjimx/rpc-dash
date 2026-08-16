/* ============================================================
   commands/utility.js
   Utilidades: snipe (mensajes eliminados), purge (borra tus
   mensajes respetando el rate limit de eliminación).
   ============================================================ */

import { truncate } from '../utils/helpers.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  description: 'Elimina tus mensajes en el canal (máx. 100, con rate limit).',
  usage: 'purge [cantidad]',
  async run(message, args) {
    const n = Math.min(Math.max(parseInt(args[0], 10) || 100, 1), 100);
    const channel = message.channel;
    let fetched;
    try {
      fetched = await channel.messages.fetch({ limit: Math.min(n + 1, 100) });
    } catch (e) {
      return `No se pudieron obtener mensajes: ${e.message}`;
    }
    const own = fetched.filter((m) => m.author && m.author.id === message.client.user.id).first(n);
    let removed = 0;
    for (const m of own) {
      try {
        await m.delete();
        removed++;
      } catch (e) { /* rate limit u otro error */ }
      await wait(1100);
    }
    return `🧹 Purge: eliminados **${removed}** de tus mensajes en ${channel.name || 'este canal'}.`;
  },
};

export default [snipe, purge];
