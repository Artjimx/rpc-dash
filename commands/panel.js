/* ============================================================
   commands/panel.js
   Configuración y acceso a la dashboard.
   - config: ver/editar la configuración centralizada.
   - panel: muestra la URL del dashboard (el mismo servidor).
   ============================================================ */

import { getConfig, setConfig, saveConfig } from '../config/configManager.js';
import { sendText, truncate } from '../utils/helpers.js';

const configCmd = {
  name: 'config',
  aliases: ['cfg', 'settings', 'configurar'],
  category: 'panel',
  description: 'Muestra o edita la configuración del selfbot.',
  usage: 'config [prefix <p>] [owner <id>] [status <texto>]',
  async run(message, args) {
    const config = getConfig();
    const sub = (args[0] || '').toLowerCase();
    const value = args.slice(1).join(' ').trim();

    if (sub === 'prefix') {
      if (!value || value.length > 3) return 'El prefijo debe tener 1-3 caracteres.';
      setConfig('prefix', value);
      return `✅ Prefijo cambiado a «${value}».`;
    }
    if (sub === 'owner') {
      if (!/^\d{17,20}$/.test(value)) return 'ownerID inválido (ID numérico de Discord).';
      setConfig('ownerId', value);
      return `✅ ownerId configurado: ${value}`;
    }
    if (sub === 'status') {
      if (!value) return 'Uso: config status <texto> (se guarda, no toca la presencia del RPC).';
      const { applyStatus } = await import('../utils/statusManager.js');
      applyStatus(message.client, value);
      return `✅ Estado guardado: «${truncate(value, 120)}»`;
    }
    if (sub === 'save') {
      saveConfig();
      return '✅ Configuración guardada.';
    }

    const feats = config.features || {};
    const flags = Object.keys(feats).map((k) => `${k}: ${feats[k] ? '✅' : '❌'}`).join(' · ');
    return [
      '**Configuración del selfbot**',
      `Prefijo: «${config.prefix}»`,
      `ownerId: ${config.ownerId || '(vacío — la propia cuenta es el dueño)'}`,
      `Estado guardado: ${config.status || '(vacío)'}`,
      `Color embeds: ${config.embedColor}`,
      `Flags: ${flags || '—'}`,
      '',
      `Para cambiar: ${config.prefix}config prefix <p> · ${config.prefix}config owner <id> · ${config.prefix}config status <texto>`,
    ].join('\n');
  },
};

const panel = {
  name: 'panel',
  aliases: ['dashboard'],
  category: 'panel',
  description: 'Muestra la URL del dashboard del RPC.',
  usage: 'panel',
  async run(message) {
    const port = process.env.SERVER_PORT || process.env.PORT || 3000;
    const isHosted = !!process.env.SERVER_PORT || !!process.env.PORT;
    return [
      '**Presence OS — Dashboard**',
      isHosted
        ? `Este servidor corre en bot-hosting (puerto ${port}). Abre la dashboard desde el panel de tu host.`
        : `Dashboard local: http://localhost:${port}`,
      'El RPC y el selfbot de comandos comparten la misma cuenta y conexión.',
    ].join('\n');
  },
};

export default [configCmd, panel];
