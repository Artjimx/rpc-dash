/* ============================================================
   commands/help.js
   Ayuda general: SOLO contenido textual (sin embeds), agrupada
   por categorías. Nunca devuelve output vacío.
   ============================================================ */

import { getConfig } from '../config/configManager.js';

const CATEGORY_EMOJI = {
  información: 'ℹ️',
  utilidad: '🛠️',
  automatización: '⚙️',
  autoresponder: '🤖',
  panel: '📊',
  'ia/media': '🧠',
};

export default {
  name: 'help',
  aliases: ['ayuda', 'commands', 'comandos'],
  category: 'panel',
  description: 'Lista todos los comandos disponibles.',
  usage: 'help [comando]',
  async run(message, args, ctx) {
    const config = getConfig();
    const prefix = config.prefix || '.';
    const cats = ctx.registry.categories();
    const order = ['información', 'utilidad', 'automatización', 'autoresponder', 'panel', 'ia/media'];

    if (args.length) {
      const name = String(args[0]).toLowerCase().replace(/^[.,]+/, '');
      const cmd = ctx.registry.get(name);
      if (cmd) {
        const lines = [
          `**${prefix}${cmd.name}**`,
          `Descripción: ${cmd.description}`,
          `Uso: ${prefix}${cmd.usage || cmd.name}`,
        ];
        if (cmd.aliases && cmd.aliases.length) lines.push(`Alias: ${cmd.aliases.map((a) => `${prefix}${a}`).join(', ')}`);
        return lines.join('\n');
      }
      return `Comando «${args[0]}» no encontrado. Usa ${prefix}help.`;
    }

    const lines = [`**Presence OS — Selfbot de comandos**`, `Prefijo actual: «${prefix}»`, ''];

    for (const cat of order) {
      const cmds = cats[cat];
      if (!cmds || !cmds.length) continue;
      lines.push(`${CATEGORY_EMOJI[cat] || '•'} **${cat.charAt(0).toUpperCase() + cat.slice(1)}**`);
      for (const c of cmds) {
        lines.push(`  ${prefix}${c.name} — ${c.description}`);
      }
      lines.push('');
    }

    lines.push(`Usa ${prefix}help <comando> para ver el uso de uno en concreto.`);
    return lines.join('\n');
  },
};
