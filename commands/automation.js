/* ============================================================
   commands/automation.js
   Automatización útil:
   - afk: motivo personalizado, persistente.
   - reminder: temporizador con automención.
   ============================================================ */

import * as afk from '../utils/afk.js';
import {
  loadReminders, addReminder, removeReminder,
  getUserReminders, cancelUserReminder, parseDuration,
} from '../utils/reminderStore.js';

/* Cola de timeouts activos. */
const timers = new Map();

export function scheduleReminder(r, client) {
  const delay = r.fireAt - Date.now();
  if (delay <= 0) {
    fireReminder(r, client).catch(() => {});
    return;
  }
  const t = setTimeout(() => fireReminder(r, client).catch(() => {}), delay);
  timers.set(r.id, t);
}

async function fireReminder(r, client) {
  timers.delete(r.id);
  try {
    const ch = await client.channels.fetch(r.channelId).catch(() => null);
    if (!ch) return;
    const content = `⏰ <@${r.userId}> — ${r.text}`;
    const sent = await ch.send({
      content,
      allowedMentions: { parse: ['users'] },
    }).catch(() => null);
    if (sent && client._selfSent) client._selfSent.add(sent.id);
  } catch (e) { /* noop */ }
}

export function bootReminders(client) {
  loadReminders();
  const pending = getUserReminders('any').filter((r) => r.fireAt > Date.now());
  for (const r of pending) scheduleReminder(r, client);
}

export function cancelReminderById(id) {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
}

/* --- Comandos --- */

const afkCmd = {
  name: 'afk',
  aliases: ['away'],
  category: 'automatización',
  description: 'Marca AFK con motivo (se quita al escribir).',
  usage: 'afk [motivo]',
  async run(message, args) {
    const reason = args.join(' ').trim() || 'Estoy AFK';
    afk.setAFK(reason, {
      channelId: message.channel ? message.channel.id : '',
      guildId: message.guild ? message.guild.id : null,
    });
    const where = message.channel && message.channel.name ? `#${message.channel.name}` : 'este DM';
    return `💤 AFK activado: **${reason}**. Solo responderé en ${where}. Al escribir cualquier mensaje se quita.`;
  },
};

const reminderCmd = {
  name: 'reminder',
  aliases: ['remind', 'recordar', 'timer'],
  category: 'automatización',
  description: 'Programa un recordatorio (con automención).',
  usage: 'reminder <tiempo> <mensaje> · reminder list · reminder cancel <id>',
  async run(message, args) {
    const sub = (args[0] || '').toLowerCase();
    const userId = message.author.id;

    if (sub === 'list') {
      const my = getUserReminders(userId);
      if (!my.length) return 'No tienes recordatorios activos.';
      const lines = my.map((r) => {
        const secs = Math.max(0, Math.floor((r.fireAt - Date.now()) / 1000));
        const t = secs >= 3600 ? `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
          : secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s`
          : `${secs}s`;
        return `• **#${r.id}** (en ${t}): ${r.text}`;
      });
      return `⏰ **Tus recordatorios**\n${lines.join('\n')}`;
    }

    if (sub === 'cancel') {
      const id = parseInt(args[1], 10);
      if (!id) return 'Uso: reminder cancel <id>';
      const removed = cancelUserReminder(userId, id);
      if (!removed) return `No se encontró el recordatorio #${id}.`;
      cancelReminderById(id);
      return `✅ Recordatorio #${id} cancelado.`;
    }

    if (!args.length) return 'Uso: reminder <tiempo> <mensaje> · reminder list · reminder cancel <id>';
    const dur = parseDuration(args[0]);
    if (!dur) return 'Formato de tiempo inválido. Usa: `5m`, `1h`, `30s`, `2d`.';
    const text = args.slice(1).join(' ').trim();
    if (!text) return 'Escribe un mensaje para el recordatorio.';
    if (dur > 7 * 86400000) return 'El máximo es 7 días.';

    const r = addReminder({
      userId,
      channelId: message.channel.id,
      guildId: message.guild ? message.guild.id : null,
      text,
      fireAt: Date.now() + dur,
    });
    scheduleReminder(r, message.client);
    const secs = Math.floor(dur / 1000);
    const t = secs >= 3600 ? `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
      : secs >= 60 ? `${Math.floor(secs / 60)}m`
      : `${secs}s`;
    return `⏰ Recordatorio #${r.id} programado para ${t}.\nTe mencionaré con: "${text}"`;
  },
};

const automation = {
  name: 'automation',
  aliases: ['auto'],
  category: 'automatización',
  description: 'Resumen de las automatizaciones disponibles.',
  usage: 'automation',
  async run(message, args) {
    const status = afk.isAFK() ? `🟢 activo (${afk.getAFK().reason})` : '⚪ inactivo';
    const my = getUserReminders(message.author.id);
    return [
      '**Automatizaciones disponibles**',
      `- afk: ${status}`,
      `- reminder: ${my.length} activo(s)`,
    ].join('\n');
  },
};

export default [afkCmd, reminderCmd, automation];
