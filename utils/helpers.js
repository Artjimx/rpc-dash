/* ============================================================
   utils/helpers.js
   Utilidades compartidas de los comandos:
   - sendText / sendWithDelete (embed con botón eliminar)
   - parseFlags (--clave valor)
   - safeCalc (evaluador aritmético seguro, sin eval)
   - truncate, embedColor
   ============================================================ */

import { MessageActionRow, MessageButton, MessageEmbed } from 'discord.js-selfbot-v13';

export function truncate(text, max) {
  const s = String(text == null ? '' : text);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function embedColor(color) {
  if (!color) return null;
  const c = String(color).trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(c)) return parseInt(c.replace('#', ''), 16);
  return null;
}

export async function sendText(message, text) {
  try {
    const sent = await message.reply({ content: truncate(text, 2000), allowedMentions: { parse: [] } });
    return sent;
  } catch (e) {
    try { return await message.channel.send(truncate(text, 2000)); } catch (e2) { throw e2; }
  }
}

/* Envía embeds con un botón 🗑 que elimina el mensaje al hacer clic. */
export async function sendWithDelete(message, embeds, opts = {}) {
  const cid = `del_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
  const row = new MessageActionRow().addComponents(
    new MessageButton().setCustomId(cid).setStyle('DANGER').setLabel('Eliminar').setEmoji('🗑'),
  );
  const payload = { embeds, components: [row] };
  if (opts.content) payload.content = truncate(opts.content, 2000);
  const sent = await message.channel.send(payload);
  try {
    const filter = (i) => i.customId === cid;
    const collector = sent.createMessageComponentCollector({ filter, time: 120000 });
    collector.on('collect', async (i) => {
      try { await i.deferUpdate(); } catch (e) { /* noop */ }
      try { await sent.delete(); } catch (e) { /* noop */ }
      try { collector.stop(); } catch (e) { /* noop */ }
    });
  } catch (e) { /* el botón sigue, solo sin auto-borrado */ }
  return sent;
}

export function buildEmbed(props = {}) {
  const emb = new MessageEmbed();
  if (props.title) emb.setTitle(truncate(props.title, 256));
  if (props.description) emb.setDescription(truncate(props.description, 4096));
  if (props.color) {
    const n = embedColor(props.color);
    if (n != null) emb.setColor(n);
  }
  if (props.image) emb.setImage(props.image);
  if (props.thumbnail) emb.setThumbnail(props.thumbnail);
  if (props.footer) emb.setFooter({ text: truncate(props.footer, 2048) });
  if (props.author) {
    const a = typeof props.author === 'string' ? { name: props.author } : props.author;
    emb.setAuthor({ name: truncate(a.name || '', 256) });
  }
  if (props.timestamp) emb.setTimestamp();
  for (const f of props.fields || []) {
    if (f && (f.name || f.value)) emb.addField(truncate(f.name || '—', 256), truncate(f.value || '—', 1024), !!f.inline);
  }
  return emb;
}

/* --- Flags: --titulo "x" --color #fff --- */
export function parseFlags(args) {
  const out = {};
  const ordered = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).toLowerCase();
      let value = true;
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        value = args[++i];
      }
      if (key === 'field' || key === 'f') ordered.push(value);
      else out[key] = value;
    } else if (i === 0) {
      out._first = a;
    }
  }
  out._fields = ordered;
  return out;
}

/* --- Evaluador aritmético seguro (sin eval) --- */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      if (!/^\d+(\.\d+)?$/.test(num)) throw new Error('Número inválido: ' + num);
      tokens.push({ t: 'num', v: parseFloat(num) });
      continue;
    }
    if ('+-*/%^()'.includes(ch)) {
      tokens.push({ t: ch, v: ch });
      i++;
      continue;
    }
    throw new Error(`Carácter no soportado: «${ch}»`);
  }
  return tokens;
}

function createParser(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function parsePrimary() {
    const tok = next();
    if (!tok) throw new Error('Expresión incompleta');
    if (tok.t === 'num') return tok.v;
    if (tok.t === '(') {
      const v = parseAddSub();
      const close = next();
      if (!close || close.t !== ')') throw new Error('Falta «)»');
      return v;
    }
    if (tok.t === '-') return -parsePrimary();
    if (tok.t === '+') return parsePrimary();
    throw new Error('Expresión inválida');
  }
  function parsePow() {
    let base = parsePrimary();
    while (peek() && peek().t === '^') {
      next();
      const exp = parsePow();
      base = Math.pow(base, exp);
    }
    return base;
  }
  function parseMulDiv() {
    let left = parsePow();
    while (peek() && (peek().t === '*' || peek().t === '/' || peek().t === '%')) {
      const op = next().t;
      const right = parsePow();
      if (op === '*') left *= right;
      else if (op === '/') left = right === 0 ? NaN : left / right;
      else left = right === 0 ? NaN : left % right;
    }
    return left;
  }
  function parseAddSub() {
    let left = parseMulDiv();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t;
      const right = parseMulDiv();
      if (op === '+') left += right;
      else left -= right;
    }
    return left;
  }
  return { value: parseAddSub(), end: pos };
}

export function safeCalc(expr) {
  const tokens = tokenize(String(expr));
  if (!tokens.length) throw new Error('Expresión vacía');
  const r = createParser(tokens);
  if (r.end < tokens.length) throw new Error('Expresión inválida (sobran caracteres)');
  if (!Number.isFinite(r.value)) throw new Error('Resultado no finito');
  return Object.is(r.value, -0) ? 0 : Number(r.value.toPrecision(12));
}

export function formatNumber(n) {
  return String(n).replace(/\.0+$/, '');
}
