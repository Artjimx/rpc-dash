/* ============================================================
   commands/info.js
   Comandos de información y personalización de embeds.
   - userinfo / avatar / banner
   - serverinfo (alias guildinfo)
   - customembed / embed (con botón 🗑 de auto-borrado)
   ============================================================ */

import { getConfig } from '../config/configManager.js';
import { buildEmbed, sendWithDelete, sendText, parseFlags, truncate } from '../utils/helpers.js';

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
    const config = getConfig();
    const target = resolveTarget(message, args);
    const guild = message.guild;
    const member = guild ? guild.members.cache.get(target.id) : null;
    const emb = buildEmbed({
      title: member && member.displayName ? `${member.displayName} (${target.username})` : `${target.username}`,
      color: config.embedColor,
      thumbnail: target.displayAvatarURL({ dynamic: true, size: 256 }),
      fields: [
        { name: 'ID', value: target.id, inline: true },
        { name: 'Bot', value: target.bot ? 'Sí' : 'No', inline: true },
        { name: 'Cuenta creada', value: target.createdAt ? target.createdAt.toLocaleDateString('es') : '—', inline: true },
        { name: 'Avatar', value: target.displayAvatarURL({ dynamic: true, size: 128 }), inline: false },
      ],
      timestamp: true,
    });
    if (member) {
      const roles = member.roles.cache.map((r) => r.name).filter((n) => n !== '@everyone');
      emb.addField('Se unió al servidor', member.joinedAt ? member.joinedAt.toLocaleDateString('es') : '—', true);
      emb.addField('Roles', roles.length ? truncate(roles.join(', '), 1024) : 'Sin roles', true);
    }
    const banner = await bannerURL(target);
    if (banner) emb.setImage(banner);
    await sendWithDelete(message, [emb]);
  },
};

const serverinfo = {
  name: 'serverinfo',
  aliases: ['guildinfo', 'gi', 'si'],
  category: 'información',
  description: 'Información del servidor actual.',
  usage: 'serverinfo',
  async run(message) {
    const config = getConfig();
    const g = message.guild;
    if (!g) return 'Este comando solo funciona en un servidor.';
    const owner = g.members.cache.get(g.ownerId) || (await g.fetchOwner().catch(() => null));
    const text = g.channels.cache.filter((c) => c.type === 0).size;
    const voice = g.channels.cache.filter((c) => c.type === 2).size;
    const categories = g.channels.cache.filter((c) => c.type === 4).size;
    const emb = buildEmbed({
      title: g.name,
      color: config.embedColor,
      thumbnail: g.iconURL({ dynamic: true, size: 256 }),
      footer: `ID: ${g.id}`,
      fields: [
        { name: 'Dueño', value: owner ? owner.user.username : String(g.ownerId), inline: true },
        { name: 'Miembros', value: String(g.memberCount), inline: true },
        { name: 'Creado', value: g.createdAt ? g.createdAt.toLocaleDateString('es') : '—', inline: true },
        { name: 'Canales', value: `${text} texto · ${voice} voz · ${categories} categorías`, inline: true },
        { name: 'Roles', value: String(g.roles.cache.size), inline: true },
        { name: 'Emojis', value: String(g.emojis.cache.size), inline: true },
        { name: 'Stickers', value: String(g.stickers.cache.size), inline: true },
        { name: 'Boosts', value: String(g.premiumSubscriptionCount || 0), inline: true },
      ],
      timestamp: true,
    });
    await sendWithDelete(message, [emb]);
  },
};

const avatar = {
  name: 'avatar',
  aliases: ['av'],
  category: 'información',
  description: 'Avatar de un usuario en grande.',
  usage: 'avatar [@usuario]',
  async run(message, args) {
    const config = getConfig();
    const target = resolveTarget(message, args);
    const url = target.displayAvatarURL({ dynamic: true, size: 1024 });
    const emb = buildEmbed({
      title: `Avatar de ${target.username}`,
      color: config.embedColor,
      image: url,
      footer: `ID: ${target.id}`,
    });
    await sendWithDelete(message, [emb]);
  },
};

const banner = {
  name: 'banner',
  aliases: ['ban'],
  category: 'información',
  description: 'Banner de un usuario (si es visible).',
  usage: 'banner [@usuario]',
  async run(message, args) {
    const config = getConfig();
    const target = resolveTarget(message, args);
    const url = await bannerURL(target);
    if (!url) return `No se pudo obtener el banner de ${target.username} (solo visible para usuarios en caché/amigos).`;
    const emb = buildEmbed({
      title: `Banner de ${target.username}`,
      color: config.embedColor,
      image: url,
      footer: `ID: ${target.id}`,
    });
    await sendWithDelete(message, [emb]);
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
    return `🔗 Perfil de <@${id}> → https://discord.com/users/${id}`;
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
  description: 'Crea un embed personalizado con botón de eliminar.',
  usage: 'customembed --title "T" --description "D" --color "#fff" --image URL --thumbnail URL --footer "F" --author "A" --timestamp --field "N|V|inline"',
  async run(message, args) {
    const config = getConfig();
    if (!args.length) {
      return `Uso: ${config.prefix}customembed --title "Título" --description "Descripción" --color "#5865F2" --image <url> --thumbnail <url> --footer "Pie" --author "Autor" --timestamp --field "Nombre|Valor|inline"`;
    }
    const p = parseEmbedFlags(args);
    if (!p.title && !p.description && !p.image) {
      return 'Necesitas al menos --title, --description o --image.';
    }
    const emb = buildEmbed({
      title: p.title,
      description: p.description,
      color: p.color || config.embedColor,
      image: p.image,
      thumbnail: p.thumbnail,
      footer: p.footer,
      author: p.author,
      timestamp: p.timestamp,
      fields: p.fields,
    });
    await sendWithDelete(message, [emb]);
  },
};

const embed = {
  ...customembed,
  name: 'embed',
  aliases: ['ce'],
};

export default [userinfo, serverinfo, avatar, banner, jump, customembed, embed];
