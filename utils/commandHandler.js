/* ============================================================
   utils/commandHandler.js
   Registro centralizado de comandos + despacho.
   - Cada comando: { name, aliases[], category, description,
     usage, run(message, args, ctx) }.
   - Solo responde a mensajes que empiecen con el prefijo.
   - Valida permisos (solo el dueño/cuenta propia ejecuta).
   - Manejo de errores: nunca deja el chat sin respuesta.
   ============================================================ */

import { getConfig } from '../config/configManager.js';
import { isOwner } from './permissions.js';

export function newCommandRegistry() {
  const commands = new Map();
  const byAlias = new Map();

  return {
    register(cmd) {
      if (!cmd || !cmd.name) return;
      commands.set(cmd.name.toLowerCase(), cmd);
      for (const a of cmd.aliases || []) byAlias.set(String(a).toLowerCase(), cmd.name.toLowerCase());
    },
    get(name) {
      const n = String(name).toLowerCase();
      const cmd = commands.get(n);
      if (cmd) return cmd;
      const target = byAlias.get(n);
      return target ? commands.get(target) : null;
    },
    list() {
      return [...commands.values()];
    },
    categories() {
      const out = {};
      for (const cmd of commands.values()) {
        const cat = cmd.category || 'general';
        (out[cat] = out[cat] || []).push(cmd);
      }
      return out;
    },
    size() {
      return commands.size;
    },
  };
}

export function parseArgs(content, prefix) {
  const raw = String(content).slice(prefix.length).trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  return { name: parts.shift().toLowerCase(), args: parts };
}

export async function dispatch(client, message, ctx) {
  const config = getConfig();
  const prefix = config.prefix || '.';
  const parsed = parseArgs(message.content, prefix);
  if (!parsed) return;

  const cmd = ctx.registry.get(parsed.name);
  if (!cmd) {
    try {
      await message.reply(`Comando desconocido «${parsed.name}». Usa ${prefix}help para ver la lista.`).catch(() => {});
    } catch (e) { /* noop */ }
    return;
  }

  if (cmd.ownerOnly && !isOwner(client, message, config)) {
    try { await message.reply('No tienes permisos para usar este comando.').catch(() => {}); } catch (e) { /* noop */ }
    return;
  }

  try {
    const out = await cmd.run(message, parsed.args, ctx);
    if (out && typeof out === 'string') {
      try { await message.reply(out).catch(() => {}); } catch (e) { /* noop */ }
    }
  } catch (err) {
    const msg = (err && err.message) || 'Error desconocido';
    try { await message.reply(`⚠️ ${msg}`).catch(() => {}); } catch (e) { /* noop */ }
  }
}
