/* ============================================================
   commands/automation.js
   Automatización útil: afk (motivo personalizado, persistente).
   El listener central usa utils/afk.js para responder menciones
   y quitar el AFK con cualquier mensaje propio.
   ============================================================ */

import * as afk from '../utils/afk.js';

const afkCmd = {
  name: 'afk',
  aliases: ['away'],
  category: 'automatización',
  description: 'Marca AFK con motivo (se quita al escribir).',
  usage: 'afk [motivo]',
  async run(message, args) {
    const reason = args.join(' ').trim() || 'Estoy AFK';
    afk.setAFK(reason);
    return `💤 AFK activado: **${reason}**. Al escribir cualquier mensaje se quita. Quien te escriba al DM o te mencione recibirá este aviso.`;
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
    return [
      '**Automatizaciones disponibles**',
      `- afk: ${status}`,
      `- Autoresponder por mención: usa el comando *autoresponder*`,
    ].join('\n');
  },
};

export default [afkCmd, automation];
