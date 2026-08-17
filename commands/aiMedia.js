/* ============================================================
   commands/aiMedia.js
   IA y multimedia con proveedores reales:
   - imgsearch: búsqueda de imágenes (DuckDuckGo, sin clave)
   - search: DuckDuckGo Instant Answer (sin clave)
   - lyrics: lyrics.ovh (sin clave)
   - images: Pexels (requiere PEXELS_API_KEY)
   - song: YouTube Data API (requiere YOUTUBE_API_KEY)
   - transcribe: OpenAI Whisper (requiere OPENAI_API_KEY)
   - ai: Puter.js (gratis con cuenta) / OpenAI
   ============================================================ */

import { webSearch } from '../ai/searchService.js';
import { searchImages } from '../ai/imageSearchService.js';
import { searchSongs, getLyrics } from '../ai/musicService.js';
import { transcribe } from '../ai/transcriptionService.js';
import { openAiChat } from '../providers/chatProvider.js';
import { puterChat, parsePuterResponse } from '../providers/puterProvider.js';
import { freeImageSearch } from '../providers/freeImageSearch.js';
import { aiTools, executeTool } from '../ai/tools.js';
import { truncate } from '../utils/helpers.js';

const imgsearch = {
  name: 'imgsearch',
  aliases: ['isearch', 'buscarimg', 'buscarimagen'],
  category: 'ia/media',
  description: 'Busca imágenes por texto (DuckDuckGo, sin clave).',
  usage: 'imgsearch <consulta>',
  async run(message, args) {
    if (!args.length) return 'Uso: imgsearch <consulta>';
    const results = await freeImageSearch(args.join(' '), 3);
    if (!results.length) return 'Sin imágenes para esa búsqueda.';
    const lines = results.map((r, i) => `${i + 1}. ${r.url}\n   ${r.title ? truncate(r.title, 60) : ''}`);
    return truncate(`🖼️ **${args.join(' ')}**\n${lines.join('\n')}`, 1900);
  },
};

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
  description: 'Chatea con IA (Puter.js con tools o OpenAI).',
  usage: 'ai <pregunta>',
  async run(message, args) {
    if (!args.length) return 'Uso: ai <pregunta>';
    const prompt = args.join(' ');
    const systemMsg = 'Eres un asistente útil y conciso. Responde en el idioma del usuario. Si el usuario pide buscar imágenes, canciones o transcribir audio, usa las herramientas disponibles.';

    // Puter.js con function calling
    if (process.env.PUTER_AUTH_TOKEN) {
      try {
        const response = await puterChat([
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ], 'openai/gpt-5.5', aiTools);
        const { text, toolCalls } = parsePuterResponse(response);
        if (toolCalls && toolCalls.length) {
          const results = [];
          for (const tc of toolCalls) {
            const fn = tc.function;
            const argsParsed = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments;
            const result = await executeTool(fn.name, argsParsed);
            results.push(`**${fn.name}**: ${result}`);
          }
          // Segunda llamada: la IA resume los resultados
          const followUp = await puterChat([
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt },
            { role: 'assistant', content: text, tool_calls: toolCalls },
            { role: 'tool', content: results.join('\n\n'), tool_call_id: toolCalls[0].id },
          ], 'openai/gpt-5.5');
          const { text: finalText } = parsePuterResponse(followUp);
          return truncate(finalText || results.join('\n'), 1990);
        }
        if (text) return truncate(text, 1990);
      } catch (e) { /* intenta fallback */ }
    }
    // OpenAI (requiere OPENAI_API_KEY)
    if (process.env.OPENAI_API_KEY) {
      try {
        const answer = await openAiChat([
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ]);
        if (answer) return truncate(answer, 1990);
      } catch (e) { /* fallback a mensaje */ }
    }
    // Sin configurar
    return [
      '**🤖 IA sin configurar**',
      'Puter.js es gratis pero necesita una cuenta (5 segundos, sin tarjeta).',
      '',
      '**Pasos:**',
      '1. Entra a **puter.com** y crea una cuenta gratis',
      '2. Abre consola del navegador (F12) y escribe: `puter.getUser()`',
      '3. Copia tu token y añádelo como variable de entorno en bot-hosting:',
      '```PUTER_AUTH_TOKEN=tu_token```',
      '',
      'Con Puter.js tienes tools: `$images`, `$song`, `$transcribe`.',
    ].join('\n');
  },
};

export default [imgsearch, search, lyrics, images, song, transcribeCmd, ai];
