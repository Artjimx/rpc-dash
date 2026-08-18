/* ============================================================
   commands/tactical.js
   Comandos tácticos de selfbot: DM purge, self-search,
   ghost-ping, friend clean, scrub mentions, mutuals.
   ============================================================ */

import { awaitRateLimit } from '../utils/humanize.js';
import { truncate } from '../utils/helpers.js';

const nukedm = {
  name: 'nukedm',
  aliases: ['ndm'],
  category: 'tactical',
  description: 'Elimina tus mensajes en DMs (todos o con un usuario específico).',
  usage: 'nukedm [@usuario]',
  async run(message, args) {
    const client = message.client;
    const userId = client.user.id;

    try { await message.delete(); } catch (e) { /* noop */ }

    let targetDm = null;
    if (args[0]) {
      const mention = args[0].replace(/[^0-9]/g, '');
      if (mention) {
        try {
          const ch = await client.users.fetch(mention);
          if (ch) targetDm = ch;
        } catch (e) { /* noop */ }
      }
    }

    let totalDeleted = 0;
    const channels = client.channels.cache.filter((ch) => ch.type === 'DM');

    for (const [, ch] of channels) {
      if (targetDm && ch.recipient && ch.recipient.id !== targetDm.id) continue;

      let lastId = null;
      let keepGoing = true;
      while (keepGoing) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;

        let fetched;
        try {
          fetched = await ch.messages.fetch(opts);
        } catch (e) {
          if (await awaitRateLimit(e)) {
            try { fetched = await ch.messages.fetch(opts); } catch (e2) { break; }
          } else break;
        }

        if (!fetched || !fetched.size) break;

        const own = fetched.filter((m) => m.author && m.author.id === userId);
        for (const [, m] of own) {
          try {
            await m.delete();
            totalDeleted++;
          } catch (e) {
            if (await awaitRateLimit(e)) {
              try { await m.delete(); totalDeleted++; } catch (e2) { /* noop */ }
            }
          }
        }

        lastId = fetched.last()?.id;
        if (fetched.size < 100) keepGoing = false;
      }
    }

    return totalDeleted
      ? `💣 NukeDM: eliminados **${totalDeleted}** mensajes propios en DMs.`
      : 'No encontré mensajes propios en DMs.';
  },
};

const selfsearch = {
  name: 'selfsearch',
  aliases: ['ss'],
  category: 'tactical',
  description: 'Busca tus mensajes en el canal actual por palabra clave. Opcional: agrega "delete" al final para borrar.',
  usage: 'selfsearch <palabra> [delete]',
  async run(message, args) {
    if (!args.length) return 'Uso: `$selfsearch <palabra> [delete]`';

    const query = args[0];
    const doDelete = args.includes('delete');
    const userId = message.client.user.id;

    try { await message.delete(); } catch (e) { /* noop */ }

    const matches = [];
    let lastId = null;
    let scanned = 0;

    for (let batch = 0; batch < 20; batch++) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;

      let fetched;
      try {
        fetched = await message.channel.messages.fetch(opts);
      } catch (e) {
        if (await awaitRateLimit(e)) {
          try { fetched = await message.channel.messages.fetch(opts); } catch (e2) { break; }
        } else break;
      }

      if (!fetched || !fetched.size) break;
      scanned += fetched.size;

      for (const [, m] of fetched) {
        if (m.author && m.author.id === userId && m.content && m.content.toLowerCase().includes(query.toLowerCase())) {
          matches.push(m);
        }
      }

      lastId = fetched.last()?.id;
      if (fetched.size < 100) break;
    }

    if (!matches.length) return `🔍 No encontré mensajes tuyos con «${query}» en este canal (${scanned} mensajes escaneados).`;

    let deleted = 0;
    if (doDelete) {
      for (const m of matches) {
        try {
          await m.delete();
          deleted++;
        } catch (e) {
          if (await awaitRateLimit(e)) {
            try { await m.delete(); deleted++; } catch (e2) { /* noop */ }
          }
        }
      }
    }

    const lines = [`🔍 **SelfSearch** «${query}» — ${matches.length} coincidencias (${scanned} escaneados)`];
    for (const m of matches.slice(0, 15)) {
      const preview = truncate(m.content, 80);
      lines.push(`• [${new Date(m.createdTimestamp).toLocaleDateString('es')}] ${preview}`);
    }
    if (matches.length > 15) lines.push(`… y ${matches.length - 15} más.`);
    if (doDelete) lines.push(`\n🗑 Eliminados: ${deleted}/${matches.length}`);
    return lines.join('\n');
  },
};

const ghostping = {
  name: 'ghostping',
  aliases: ['gp'],
  category: 'tactical',
  description: 'Menciona a un usuario y borra el mensaje instantáneamente.',
  usage: 'ghostping @usuario',
  async run(message, args) {
    const mention = message.mentions.users.first();
    if (!mention) return 'Menciona a un usuario: `$ghostping @usuario`';

    try { await message.delete(); } catch (e) { /* noop */ }

    let sent;
    try {
      sent = await message.channel.send({
        content: `<@${mention.id}>`,
        allowedMentions: { parse: ['users'] },
      });
    } catch (e) {
      return `No se pudo enviar la mención: ${e.message}`;
    }

    try {
      await sent.delete();
    } catch (e) { /* noop */ }

    return null;
  },
};

const friendclean = {
  name: 'friendclean',
  aliases: ['fc'],
  category: 'tactical',
  description: 'Lista amigos que parecen inválidos o eliminados (sin username).',
  usage: 'friendclean [delete]',
  async run(message, args) {
    const client = message.client;
    const doDelete = args.includes('delete');

    try { await message.delete(); } catch (e) { /* noop */ }

    let friends;
    try {
      friends = await client.user.fetchFriends();
    } catch (e) {
      return `No se pudieron obtener amigos: ${e.message}`;
    }

    const invalid = friends.filter((f) => !f || !f.username || f.username === 'Deleted User' || f.bot);

    if (!invalid.size) return `✅ Todos tus amigos (${friends.size}) parecen válidos.`;

    const lines = [`🧹 **FriendClean** — ${invalid.size} amigos sospechosos de ${friends.size} total:`];
    const ids = [];
    for (const [, f] of invalid) {
      lines.push(`• ${f.username || 'sin-nombre'} (${f.id})`);
      ids.push(f.id);
    }

    if (doDelete) {
      let removed = 0;
      for (const id of ids) {
        try {
          await client.user.removeFriend(id);
          removed++;
        } catch (e) {
          if (await awaitRateLimit(e)) {
            try { await client.user.removeFriend(id); removed++; } catch (e2) { /* noop */ }
          }
        }
      }
      lines.push(`\n🗑 Eliminados: ${removed}/${ids.length}`);
    } else {
      lines.push('', 'Para eliminar: `$friendclean delete`');
    }
    return lines.join('\n');
  },
};

const scrubmentions = {
  name: 'scrubmentions',
  aliases: ['sm'],
  category: 'tactical',
  description: 'Muestra menciones recientes donde te etiquetaron en este canal.',
  usage: 'scrubmentions',
  async run(message) {
    const client = message.client;
    const userId = client.user.id;

    try { await message.delete(); } catch (e) { /* noop */ }

    let scanned = 0;
    const mentions = [];

    let lastId = null;
    for (let batch = 0; batch < 15; batch++) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;

      let fetched;
      try {
        fetched = await message.channel.messages.fetch(opts);
      } catch (e) {
        if (await awaitRateLimit(e)) {
          try { fetched = await message.channel.messages.fetch(opts); } catch (e2) { break; }
        } else break;
      }

      if (!fetched || !fetched.size) break;
      scanned += fetched.size;

      for (const [, m] of fetched) {
        if (m.mentions && m.mentions.has(userId) && m.author && m.author.id !== userId) {
          mentions.push(m);
        }
      }

      lastId = fetched.last()?.id;
      if (fetched.size < 100) break;
    }

    if (!mentions.length) return `🔍 No encontraron menciones recientes en este canal (${scanned} mensajes).`;

    const lines = [`📢 **ScrubMentions** — ${mentions.length} menciones (${scanned} escaneados):`];
    for (const m of mentions.slice(0, 15)) {
      const preview = truncate(m.content, 60);
      lines.push(`• **${m.author.username}**: ${preview}`);
    }
    if (mentions.length > 15) lines.push(`… y ${mentions.length - 15} más.`);
    return lines.join('\n');
  },
};

const mutuals = {
  name: 'mutuals',
  aliases: ['mu'],
  category: 'tactical',
  description: 'Muestra servidores y amigos en común con un usuario (desde caché local).',
  usage: 'mutuals @usuario',
  async run(message, args) {
    const client = message.client;

    let target;
    const mention = message.mentions.users.first();
    if (mention) {
      target = mention;
    } else if (args[0]) {
      const id = args[0].replace(/[^0-9]/g, '');
      if (id) {
        try { target = await client.users.fetch(id); } catch (e) { /* noop */ }
      }
    }

    if (!target) return 'Menciona o pasa el ID: `$mutuals @usuario`';

    try { await message.delete(); } catch (e) { /* noop */ }

    const mutualGuilds = client.guilds.cache.filter((g) => g.members.cache.has(target.id));

    let mutualFriends = [];
    try {
      const friends = await client.user.fetchFriends();
      mutualFriends = friends.filter((f) => f && f.id === target.id);
    } catch (e) { /* noop */ }

    const lines = [`🤝 **Mutuals** — ${target.username} (${target.id}):`];
    lines.push(`**Servidores en común (${mutualGuilds.size}):**`);
    if (mutualGuilds.size) {
      for (const [, g] of mutualGuilds) {
        lines.push(`• ${g.name} (${g.memberCount} miembros)`);
      }
    } else {
      lines.push('• Ninguno visible en caché.');
    }

    lines.push(`**Amigos en común:** ${mutualFriends.size ? mutualFriends.map((f) => f.username).join(', ') : 'Ninguno o no visible.'}`);

    return lines.join('\n');
  },
};

export default [nukedm, selfsearch, ghostping, friendclean, scrubmentions, mutuals];
