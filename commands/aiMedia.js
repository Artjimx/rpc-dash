/* ============================================================
   commands/aiMedia.js
   IA y multimedia con proveedores reales:
   - search: DuckDuckGo Instant Answer (sin clave)
   - lyrics: lyrics.ovh (sin clave)
   - images: Pexels (requiere PEXELS_API_KEY)
   - song: YouTube Data API (requiere YOUTUBE_API_KEY)
   - transcribe: OpenAI Whisper (requiere OPENAI_API_KEY)
   - ai: Puter.js (gratis, requiere PUTER_AUTH_TOKEN) o OpenAI
   ============================================================ */

import { webSearch } from '../ai/searchService.js';
import { searchImages } from '../ai/imageSearchService.js';
import { searchSongs, getLyrics } from '../ai/musicService.js';
import { transcribe } from '../ai/transcriptionService.js';
import { openAiChat } from '../providers/chatProvider.js';
import { puterChat } from '../providers/puterProvider.js';
import { truncate } from '../utils/helpers.js';

const search = {
  name: 'search',
  aliases: ['buscar'],
  category: 'ia/media',
  description: 'Busca información en la web (DuckDuckGo).',
  usage: 'search <consulta>',
  async run(message, args) {
    if (!args.length) return 'Uso: search <consulta>';
    const r = await webSearch(args.join(' '));
    if (!r) return 'Sin resultados para esa búsqueda.';
    const urlLine = r.url ? `\n🔗 ${r.url}` : '';
    return truncate(`🔎 ${r.text}${urlLine}`, 1900);
  },
};

const lyrics = {
  name: 'lyrics',
  aliases: ['letra'],
  category: 'ia/media',
  description: 'Letra de una canción (lyrics.ovh).',
  usage: 'lyrics <artista> - <título>',
  async run(message, args) {
    if (!args.length) return 'Uso: lyrics <artista> - <título>';
    const joined = args.join(' ');
    const parts = joined.split('-').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) {
      const split = joined.split(' ');
      if (split.length < 2) return 'Uso: lyrics <artista> - <título>';
      parts[0] = split.shift();
      parts[1] = split.join(' ');
    }
    const text = await getLyrics(parts[0], parts[1]);
    if (!text) return `No se encontró la letra de «${parts[0]} - ${parts[1]}».`;
    return truncate(`🎵 **${parts[0]} — ${parts[1]}**\n${text}`, 1990);
  },
};

const images = {
  name: 'images',
  aliases: ['imagenes', 'img'],
  category: 'ia/media',
  description: 'Busca imágenes (Pexels). Requiere PEXELS_API_KEY.',
  usage: 'images <consulta>',
  async run(message, args) {
    if (!args.length) return 'Uso: images <consulta>';
    const photos = await searchImages(args.join(' '), 3);
    if (!photos.length) return 'Sin imágenes para esa búsqueda.';
    const lines = photos.map((p, i) => `${i + 1}. ${p.url}${p.alt ? ` — ${truncate(p.alt, 80)}` : ''}`);
    return truncate(`🖼️ **${args.join(' ')}**\n${lines.join('\n')}`, 1900);
  },
};

const song = {
  name: 'song',
  aliases: ['cancion', 'music'],
  category: 'ia/media',
  description: 'Busca una canción en YouTube. Requiere YOUTUBE_API_KEY.',
  usage: 'song <título o artista>',
  async run(message, args) {
    if (!args.length) return 'Uso: song <título o artista>';
    const results = await searchSongs(args.join(' '), 3);
    if (!results.length) return 'Sin resultados.';
    return truncate(
      `🎧 **${args.join(' ')}**\n` +
      results.map((r, i) => `${i + 1}. ${r.title} — ${r.channel}\n   ${r.url}`).join('\n'),
      1900,
    );
  },
};

const transcribeCmd = {
  name: 'transcribe',
  aliases: ['transcribir'],
  category: 'ia/media',
  description: 'Transcribe un audio adjunto (Whisper). Requiere OPENAI_API_KEY.',
  usage: 'transcribe (con un archivo de audio adjunto)',
  async run(message) {
    const att = message.attachments && message.attachments.first();
    if (!att) return 'Adjunta un archivo de audio a este comando (ej: .transcribe con archivo .mp3/.wav).';
    const text = await transcribe(att.url);
    if (!text) return 'No se pudo transcribir el audio.';
    return truncate(`🎙️ **Transcripción**\n${text}`, 1990);
  },
};

const ai = {
  name: 'ai',
  aliases: ['ask', 'chat', 'gpt'],
  category: 'ia/media',
  description: 'Chatea con IA (Puter.js gratis o OpenAI).',
  usage: 'ai <pregunta> · ai <modelo> <pregunta>',
  async run(message, args) {
    if (!args.length) return 'Uso: ai <pregunta>';
    const models = ['openai/gpt-5.5', 'anthropic/claude-opus-5', 'google/gemini-3.6-flash', 'deepseek/deepseek-v4-pro', 'meta-llama/llama-4-maverick'];
    let model = null;
    let prompt = args.join(' ');
    const firstArg = args[0].toLowerCase();
    for (const m of models) {
      if (firstArg === m.split('/').pop() || firstArg === m) { model = m; prompt = args.slice(1).join(' '); break; }
    }
    if (!prompt) return 'Escribe tu pregunta.';
    try {
      if (process.env.PUTER_AUTH_TOKEN) {
        const answer = await puterChat([{ role: 'user', content: prompt }], model || 'openai/gpt-5.5');
        if (!answer) return 'Sin respuesta de la IA.';
        return truncate(answer, 1990);
      }
      if (process.env.OPENAI_API_KEY) {
        const answer = await openAiChat([
          { role: 'system', content: 'Eres un asistente útil y conciso. Responde en el idioma del usuario.' },
          { role: 'user', content: prompt },
        ]);
        if (!answer) return 'Sin respuesta de la IA.';
        return truncate(answer, 1990);
      }
      return 'Configura PUTER_AUTH_TOKEN (gratis en puter.com) o OPENAI_API_KEY.';
    } catch (e) {
      return `⚠️ Error de IA: ${e.message}`;
    }
  },
};

export default [search, lyrics, images, song, transcribeCmd, ai];
