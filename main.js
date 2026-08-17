/* ============================================================
   main.js — Core del selfbot de comandos (módulo).
   Se engancha al MISMO cliente de Discord del RPC (sin tocar la
   dashboard). Exporta bootCommandSystem(client).

   Flujo de mensajes:
   1. Comandos: solo los ejecuta la propia cuenta (selfbot) y
      solo si el mensaje empieza con el prefijo configurado.
   2. Mensaje propio no-comando: quita el AFK.
   3. Mensajes de otros: en DM (AFK) o por mención a tu usuario,
      primero AFK (avisa el motivo), luego autoresponder.
   4. Plugins: reciben onMessage (pueden responder aparte).
   ============================================================ */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from './config/configManager.js';
import { newCommandRegistry, dispatch } from './utils/commandHandler.js';
import { log } from './utils/logger.js';
import { isOwner } from './utils/permissions.js';
import { trackSent, isSelfSent } from './utils/helpers.js';
import * as ar from './utils/autoresponder.js';
import * as afk from './utils/afk.js';
import * as ts from './utils/triggerStore.js';
import { initStatusManager } from './utils/statusManager.js';
import { loadPlugins, runPluginReady } from './plugins/pluginManager.js';
import { bootReminders } from './commands/automation.js';

import cmdHelp from './commands/help.js';
import cmdInfo from './commands/info.js';
import cmdAutoresponder from './commands/autoresponder.js';
import cmdTriggers from './commands/triggers.js';
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

  const modules = [cmdHelp, cmdInfo, cmdAutoresponder, cmdTriggers, cmdUtility, cmdAutomation, cmdPanel, cmdAiMedia];
  for (const mod of modules) {
    for (const cmd of collectCommands(mod)) {
      registry.register(cmd);
    }
  }

  const ctx = { client, registry };
  initStatusManager(client, config);
  const plugins = await loadPlugins(__dirname);
  bootReminders(client);

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
  client._cmdRegistry = registry;
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

  /* 2) Mensaje propio no-comando → sale del AFK y notifica.
        Ignora mensajes enviados por el propio bot (respuestas),
        para que no desactiven el AFK solos.
        También ignora mensajes dentro de los 5s posteriores a la
        activación o a una notificación AFK del bot. */
  if (own) {
    if (afk.isAFK()) {
      const sinceActivation = Date.now() - (afk.getAFK().since || 0);
      const sinceNotify = afk.sinceLastNotify();
      if (!isSelfSent(client, message) && sinceActivation > 5000 && sinceNotify > 5000) {
        if (afk.clearAFK()) {
          log.info('AFK desactivado (mensaje propio).');
          await notifyAfkExit(message);
        }
      }
    }
    return;
  }

  /* 3) AFK + autoresponder. */
  if (config.features && config.features.autoresponder === false) {
    await runPlugins(message, ctx, plugins);
    return;
  }
  await respondOnMention(message, ctx);
  await runPlugins(message, ctx, plugins);
}

/* Notifica la salida del AFK y borra el aviso a los 6 segundos. */
async function notifyAfkExit(message) {
  try {
    const sent = await message.reply('✅ Saliste del modo AFK.');
    trackSent(message.client, sent);
    setTimeout(() => {
      sent.delete().catch(() => {});
    }, 6000);
  } catch (e) { /* noop */ }
}

async function respondOnMention(message, ctx) {
  const client = ctx.client;
  const prefix = getConfig().prefix || '.';
  const isDm = !message.guild;
  const mentioned = !!(message.mentions && message.mentions.has(client.user.id));
  if (message.content.startsWith(prefix)) return;

  /* AFK: solo en el canal donde se activó (DM: cualquier mensaje, servidor: por mención). */
  if (afk.isAFK()) {
    if ((isDm || mentioned) && afk.matchesChannel(message)) {
      if (afk.shouldNotify(message.author.id)) {
        const a = afk.getAFK();
        const reason = a.reason || 'Estoy AFK';
        try {
          const sent = await message.reply(`💤 **AFK** — ${reason} (desde hace ${afk.sinceText()}). Te respondo cuando vuelva.`);
          trackSent(client, sent);
          afk.touchNotify();
        } catch (e) { /* noop */ }
      }
    }
    return;
  }

  /* Autoresponder: solo por mención, contexto dm/server. */
  if (!mentioned) {
    // Triggers: disparador por texto (no necesita mención)
    const match = ts.findMatch(message.content);
    if (match) {
      try {
        const sent = await message.channel.send(match.response);
        trackSent(client, sent);
      } catch (e) { /* noop */ }
    }
    return;
  }
  const res = ar.nextResponse(ar.ctxOf(message));
  if (res && res.text) {
    try {
      const sent = await message.reply(res.text);
      trackSent(client, sent);
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
