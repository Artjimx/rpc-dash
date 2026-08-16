/* ============================================================
   commands/utility.js
   Utilidades: snipe (mensajes eliminados), calc (aritmética
   segura), translate (Google Translate, endpoint público gtx).
   ============================================================ */

import { sendText, safeCalc, formatNumber, truncate } from '../utils/helpers.js';

const snipe = {
  name: 'snipe',
  aliases: ['sn'],
  category: 'utilidad',
  description: 'Muestra el último mensaje eliminado en el canal.',
  usage: 'snipe [canal]',
  async run(message) {
    const cache = message.client._snipeCache || new Map();
    const target = message.mentions.channels.first() || message.channel;
    const entry = cache.get(target.id);
    if (!entry) return `No hay mensajes eliminados recientes en ${target.name || 'este canal'}.`;
    const head = `**Snipe en ${target.name || 'canal'}**\n👤 ${entry.author || 'desconocido'} · 🕒 ${new Date(entry.ts).toLocaleTimeString('es')}`;
    let body = entry.content ? truncate(entry.content, 1800) : '*sin contenido*';
    if (entry.attachment) body += `\n🖼️ ${entry.attachment}`;
    return `${head}\n${body}`;
  },
};

const calc = {
  name: 'calc',
  aliases: ['calcular', 'math'],
  category: 'utilidad',
  description: 'Evalúa una expresión aritmética de forma segura.',
  usage: 'calc <expresión> (ej: 2*(3+4)^2)',
  async run(message, args) {
    if (!args.length) return 'Uso: calc <expresión> — ejemplo: calc (2+3)*4%3';
    const expr = args.join(' ');
    const result = safeCalc(expr);
    return `🧮 ${expr} = **${formatNumber(result)}**`;
  },
};

const translate = {
  name: 'translate',
  aliases: ['traducir', 'tr'],
  category: 'utilidad',
  description: 'Traduce texto a otro idioma (Google Translate público).',
  usage: 'translate <idioma> <texto>',
  async run(message, args) {
    const lang = (args[0] || '').toLowerCase().replace(/^--?/, '');
    const text = args.slice(1).join(' ').trim();
    if (!/^[a-z]{2,5}$/.test(lang)) return 'Uso: translate <idioma> <texto> — ejemplo: translate en "hola mundo"';
    if (!text) return 'Falta el texto a traducir.';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Translate: HTTP ${res.status}`);
    const data = await res.json();
    const translated = (data[0] || []).map((seg) => seg && seg[0]).join('').trim();
    if (!translated) return 'No se pudo traducir el texto.';
    return `🌐 **${lang.toUpperCase()}** → ${truncate(translated, 1900)}`;
  },
};

export default [snipe, calc, translate];
