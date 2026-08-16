/* ============================================================
   plugins/pluginManager.js
   Carga módulos de plugins desde este directorio.
   Cada plugin debe exportar por defecto:
     { name, onReady?(client, ctx), onMessage?(message, ctx) }
   Permite extender el selfbot sin tocar el core (main.js).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getConfig } from '../config/configManager.js';
import { log } from '../utils/logger.js';

export async function loadPlugins(baseDir) {
  const config = getConfig();
  if (config.features && config.features.plugins === false) return [];

  const dir = path.join(baseDir, 'plugins');
  if (!fs.existsSync(dir)) return [];

  const plugins = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    try {
      const mod = await import(pathToFileURL(path.join(dir, file)).href);
      const plugin = mod.default || mod;
      if (plugin && typeof plugin === 'object' && plugin.name) {
        plugins.push(plugin);
        log.info(`Plugin cargado: ${plugin.name}`);
      }
    } catch (e) {
      log.warn(`Plugin ${file}: ${e.message}`);
    }
  }
  return plugins;
}

export async function runPluginReady(plugins, client, ctx) {
  for (const p of plugins) {
    try { if (typeof p.onReady === 'function') await p.onReady(client, ctx); } catch (e) { log.warn(`onReady ${p.name}: ${e.message}`); }
  }
}
