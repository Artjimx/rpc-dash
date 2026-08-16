/* ============================================================
   main.js — Core del selfbot de comandos (módulo).
   Se engancha al MISMO cliente de Discord del RPC (sin tocar la
   dashboard). Exporta bootCommandSystem(client).

   Flujo de mensajes:
   1. Comandos: solo los ejecuta la propia cuenta (selfbot) y
      solo si el mensaje empieza con el prefijo configurado.
   2. Mensaje propio no-comando: quita el AFK.
   3. Menciones de otros a tu usuario: primero AFK, luego autoresponder.
   4. Plugins: reciben onMessage (pueden responder aparte).
   ============================================================ */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from './config/configManager.js';
import { newCommandRegistry, dispatch } from './utils/commandHandler.js';
import { log } from './utils/logger.js';
import { isOwner } from './utils/permissions.js';
import * as ar from './utils/autoresponder.js';
import * as afk from './utils/afk.js';
import { initStatusManager } from './utils/statusManager.js';
import { loadPlugins, runPluginReady } from './plugins/pluginManager.js';

import cmdHelp from './commands/help.js';
import cmdInfo from './commands/info.js';
import cmdAutoresponder from './commands/autoresponder.js';
import cmdUtility from './commands/utility.js';
import cmdAutomation from './commands/automation.js';
import cmdPanel from './commands/panel.js';
import cmdAiMedia from './commands/aiMedia.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const booted = new WeakSet();

function collectCommands(mod) {
  const out = [];
  const m = mod && mod.default !== undefined ? mod.default : mod;
  if (Array.isArray(m)) out.push(...m);
  else if (m && typeof m === 'object' && m.name) out.push(m);
  return out;
}

export async function bootCommandSystem(client) {
  if (!client || booted.has(client)) return null;
  booted.add(client);

  const config = getConfig();
  const registry = newCommandRegistry();

  const modules = [cmdHelp, cmdInfo, cmdAutoresponder, cmdUtility, cmdAutomation, cmdPanel, cmdAiMedia];
  for (const mod of modules) {
    for (const cmd of collectCommands(mod)) {
      registry.register(cmd);
    }
  }

  const ctx = { client, registry };
  initStatusManager(client, config);
  const plugins = await loadPlugins(__dirname);

  /* Cache de snipe (mensajes eliminados), por canal. */
  client._snipeCache = new Map();
  client.on('messageDelete', (m) => {
    if (!m.channel) return;
    client._snipeCache.set(m.channel.id, {
      content: m.content || '',
      author: m.author ? (m.author.tag || m.author.username) : 'desconocido',
      attachment: m.attachments && m.attachments.first() ? m.attachments.first().url : '',
      ts: Date.now(),
    });
  });
  client.on('messageDeleteBulk', (msgs) => {
    for (const m of msgs) {
      if (!m.channel) continue;
      client._snipeCache.set(m.channel.id, {
        content: m.content || '',
        author: m.author ? (m.author.tag || m.author.username) : 'desconocido',
        attachment: m.attachments && m.attachments.first() ? m.attachments.first().url : '',
        ts: Date.now(),
      });
    }
  });

  client.on('messageCreate', async (message) => {
    try {
      await handleMessage(message, ctx, plugins);
    } catch (e) {
      log.warn(`messageCreate: ${e.message}`);
    }
  });

  runPluginReady(plugins, client, ctx).catch(() => {});
  return registry;
}

async function handleMessage(message, ctx, plugins) {
  if (!message || !message.author || !message.content) return;
  const client = ctx.client;
  const config = getConfig();
  const prefix = config.prefix || '.';
  const own = message.author.id === client.user.id;

  /* 1) Comandos (solo la cuenta propia). */
  if (own && message.content.startsWith(prefix)) {
    await dispatch(client, message, ctx);
    return;
  }

  /* 2) Mensaje propio no-comando → quita AFK. */
  if (own) {
    if (afk.isAFK()) {
      const cleared = afk.clearAFK();
      if (cleared) log.info('AFK desactivado (mensaje propio).');
    }
    return;
  }

  /* 3) AFK + autoresponder por mención. */
  if (config.features && config.features.autoresponder === false) {
    await runPlugins(message, ctx, plugins);
    return;
  }
  await respondOnMention(message, ctx);
  await runPlugins(message, ctx, plugins);
}

async function respondOnMention(message, ctx) {
  const client = ctx.client;
  const config = getConfig();
  const prefix = config.prefix || '.';
  const mentioned = !!(message.mentions && message.mentions.has(client.user.id));
  if (!mentioned) return;
  if (message.content.startsWith(prefix)) return;

  /* AFK primero. */
  if (afk.isAFK()) {
    if (afk.shouldNotify(message.author.id)) {
      const a = afk.getAFK();
      const reason = a.reason || 'Estoy AFK';
      try {
        await message.reply(`💤 **AFK** — ${reason} (desde hace ${afk.sinceText()})`);
      } catch (e) { /* noop */ }
    }
    return;
  }

  /* Autoresponder: solo por mención, contexto dm/server. */
  const res = ar.nextResponse(ar.ctxOf(message));
  if (res && res.text) {
    try {
      await message.reply(res.text);
    } catch (e) {
      log.warn(`Autoresponder: ${e.message}`);
    }
  }
}

async function runPlugins(message, ctx, plugins) {
  for (const p of plugins) {
    try {
      if (typeof p.onMessage === 'function') await p.onMessage(message, ctx);
    } catch (e) {
      log.warn(`Plugin ${p.name || '?'}: ${e.message}`);
    }
  }
}
