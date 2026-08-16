/* ============================================================
   commands/info.js
   Comandos de información y personalización de mensajes.
   SOLO texto bien formateado (sin embeds, es un selfbot).
   - userinfo / avatar / banner / jump
   - serverinfo (alias guildinfo)
   - customembed / embed (mensaje formateado con botón 🗑)
   ============================================================ */

import { getConfig } from '../config/configManager.js';
import { parseFlags, truncate } from '../utils/helpers.js';

function resolveTarget(message, args) {
  const mention = message.mentions && message.mentions.users.first();
  if (mention) return mention;
  return message.author;
}

async function bannerURL(user) {
  try {
    const u = await user.fetch(true);
    if (u && u.bannerURL) return u.bannerURL({ size: 1024, dynamic: true });
  } catch (e) { /* no se puede obtener para cuentas externas */ }
  return null;
}

const userinfo = {
  name: 'userinfo',
  aliases: ['ui'],
  category: 'información',
  description: 'Información de un usuario (o de ti mismo).',
  usage: 'userinfo [@usuario]',
  async run(message, args) {
    const target = resolveTarget(message, args);
    const guild = message.guild;
    const member = guild ? guild.members.cache.get(target.id) : null;
    const lines = [];
    const name = member && member.displayName && member.displayName !== target.username
      ? `${member.displayName} (${target.username})`
      : target.username;
    lines.push(`👤 **${name}**`);
    lines.push(`🆔 ID: \`${target.id}\` · 🤖 Bot: ${target.bot ? 'Sí' : 'No'}`);
    lines.push(`📅 Cuenta creada: ${target.createdAt ? target.createdAt.toLocaleDateString('es') : '—'}`);
    if (member) {
      const roles = member.roles.cache.map((r) => r.name).filter((n) => n !== '@everyone');
      lines.push(`📥 Se unió al servidor: ${member.joinedAt ? member.joinedAt.toLocaleDateString('es') : '—'}`);
      lines.push(`🎭 Roles: ${roles.length ? truncate(roles.join(', '), 1024) : 'Sin roles'}`);
    }
    lines.push(`🖼️ Avatar: ${target.displayAvatarURL({ dynamic: true, size: 128 })}`);
    const banner = await bannerURL(target);
    if (banner) lines.push(`🖼️ Banner: ${banner}`);
    return lines.join('\n');
  },
};

const serverinfo = {
  name: 'serverinfo',
  aliases: ['guildinfo', 'gi', 'si'],
  category: 'información',
  description: 'Información del servidor actual.',
  usage: 'serverinfo',
  async run(message) {
    const g = message.guild;
    if (!g) return 'Este comando solo funciona en un servidor.';
    const owner = g.members.cache.get(g.ownerId) || (await g.fetchOwner().catch(() => null));
    const text = g.channels.cache.filter((c) => c.type === 0).size;
    const voice = g.channels.cache.filter((c) => c.type === 2).size;
    const categories = g.channels.cache.filter((c) => c.type === 4).size;
    const lines = [];
    lines.push(`🏠 **${g.name}**`);
    lines.push(`🆔 ID: \`${g.id}\``);
    lines.push(`👑 Dueño: ${owner ? owner.user.username : String(g.ownerId)} · 👥 Miembros: ${g.memberCount}`);
    lines.push(`📅 Creado: ${g.createdAt ? g.createdAt.toLocaleDateString('es') : '—'}`);
    lines.push(`📚 Canales: ${text} texto · ${voice} voz · ${categories} categorías`);
    lines.push(`🎭 Roles: ${g.roles.cache.size} · 😀 Emojis: ${g.emojis.cache.size} · 🏷️ Stickers: ${g.stickers.cache.size}`);
    lines.push(`🚀 Boosts: ${g.premiumSubscriptionCount || 0}`);
    return lines.join('\n');
  },
};

const avatar = {
  name: 'avatar',
  aliases: ['av'],
  category: 'información',
  description: 'Avatar de un usuario en grande.',
  usage: 'avatar [@usuario]',
  async run(message, args) {
    const target = resolveTarget(message, args);
    const url = target.displayAvatarURL({ dynamic: true, size: 1024 });
    return `🖼️ **Avatar de ${target.username}** (ID: \`${target.id}\`)\n${url}`;
  },
};

const banner = {
  name: 'banner',
  aliases: ['ban'],
  category: 'información',
  description: 'Banner de un usuario (si es visible).',
  usage: 'banner [@usuario]',
  async run(message, args) {
    const target = resolveTarget(message, args);
    const url = await bannerURL(target);
    if (!url) return `No se pudo obtener el banner de ${target.username} (solo visible para usuarios en caché/amigos).`;
    return `🖼️ **Banner de ${target.username}** (ID: \`${target.id}\`)\n${url}`;
  },
};

const jump = {
  name: 'jump',
  aliases: ['profile'],
  category: 'información',
  description: 'Genera el enlace al perfil de un usuario por su ID.',
  usage: 'jump <ID de usuario | @mención>',
  async run(message, args) {
    const mention = message.mentions && message.mentions.users.first();
    const raw = mention ? mention.id : args[0];
    const id = String(raw || '').replace(/[^0-9]/g, '');
    if (!/^\d{15,20}$/.test(id)) return 'Uso: jump <ID de usuario> (o menciona al usuario).';

    let target = mention || null;
    if (!target && message.client && typeof message.client.users.fetch === 'function') {
      try {
        target = await message.client.users.fetch(id, { force: true });
      } catch (e) { /* usuario no encontrado */ }
    }

    const lines = [`🔗 **Perfil:** https://discord.com/users/${id}`];
    if (target) {
      lines.push(`👤 **${target.username}** · 🆔 \`${target.id}\``);
      lines.push(`🤖 Bot: ${target.bot ? 'Sí' : 'No'} · 📅 Cuenta creada: ${target.createdAt ? target.createdAt.toLocaleDateString('es') : '—'}`);
      lines.push(`🖼️ Avatar: ${target.displayAvatarURL({ dynamic: true, size: 128 })}`);
    }
    return lines.join('\n');
  },
};

function parseEmbedFlags(args) {
  const f = parseFlags(args);
  const fields = [];
  for (const raw of f._fields) {
    const parts = String(raw).split('|');
    fields.push({
      name: (parts[0] || '').trim(),
      value: (parts[1] || '').trim(),
      inline: (parts[2] || '').trim().toLowerCase() === 'inline' || parts[2] === 'true',
    });
  }
  return {
    title: f.title || f.t,
    description: f.description || f.desc || f.d,
    color: f.color || f.c,
    image: f.image || f.img || f.i,
    thumbnail: f.thumbnail || f.thumb,
    footer: f.footer,
    author: f.author,
    timestamp: !!f.timestamp || !!f.time,
    fields,
  };
}

const customembed = {
  name: 'customembed',
  aliases: ['embed', 'ce'],
  category: 'información',
  description: 'Crea un mensaje personalizado bien formateado.',
  usage: 'customembed --title "T" --description "D" --image URL --thumbnail URL --footer "F" --author "A" --timestamp --field "N|V|inline"',
  async run(message, args) {
    const config = getConfig();
    if (!args.length) {
      return `Uso: ${config.prefix}customembed --title "Título" --description "Descripción" --image <url> --thumbnail <url> --footer "Pie" --author "Autor" --timestamp --field "Nombre|Valor|inline"`;
    }
    const p = parseEmbedFlags(args);
    if (!p.title && !p.description && !p.image) {
      return 'Necesitas al menos --title, --description o --image.';
    }
    const lines = [];
    if (p.author) lines.push(`**${p.author}**`);
    if (p.title) lines.push(`**${p.title}**`);
    if (p.description) lines.push(p.description);
    for (const f of p.fields) {
      if (f && f.name) lines.push(`\n**${f.name}**\n${f.value || ''}`);
    }
    if (p.thumbnail) lines.push(`\n🖼️ Miniatura: ${p.thumbnail}`);
    if (p.image) lines.push(`🖼️ Imagen: ${p.image}`);
    if (p.timestamp) lines.push(`\n🕒 ${new Date().toLocaleString('es')}`);
    if (p.footer) lines.push(`_${p.footer}_`);
    return lines.join('\n') || 'Mensaje vacío.';
  },
};

const embed = {
  ...customembed,
  name: 'embed',
  aliases: ['ce'],
};

export default [userinfo, serverinfo, avatar, banner, jump, customembed, embed];
