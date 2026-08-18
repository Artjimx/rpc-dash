/* ============================================================
   commands/aiMedia.js
   IA y multimedia — sin API keys obligatorias:
   - imgsearch: imágenes (DuckDuckGo, sin clave)
   - search: búsqueda web (DuckDuckGo)
   - lyrics: LrcLib API (sin clave)
   - images: Pexels → fallback DuckDuckGo
   - song: yt-search (sin YOUTUBE_API_KEY)
   - transcribe: OpenAI Whisper → fallback HuggingFace
   - ai: Puter.js (gratis) → OpenAI
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

/* ─── imgsearch (DuckDuckGo, sin clave) ─── */
const imgsearch = {
  name: 'imgsearch',
  aliases: ['isearch', 'buscarimg', 'buscarimagen'],
  category: 'ia/media',
  description: 'Busca imágenes por texto (DuckDuckGo, sin clave).',
  usage: 'imgsearch <consulta>',
  async run(message, args) {
    if (!args.length) return 'Uso: imgsearch <consulta>';
    const query = args.join(' ');
    const results = await freeImageSearch(query, 3);
    if (!results.length) return 'Sin imágenes para esa búsqueda.';
    const lines = results.map((r, i) =>
      `${i + 1}. [ . ](${r.url})${r.title ? ` ${truncate(r.title, 60)}` : ''}`
    );
    return truncate(`🖼️ **${query}**\n${lines.join('\n')}`, 1900);
  },
};

/* ─── search (DuckDuckGo) ─── */
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

/* ─── lyrics (LrcLib, sin clave) ─── */
const lyrics = {
  name: 'lyrics',
  aliases: ['letra'],
  category: 'ia/media',
  description: 'Letra de una canción (LrcLib, sin clave).',
  usage: 'lyrics <artista> - <título>',
  async run(message, args) {
    if (!args.length) return 'Uso: lyrics <artista> - <título>';
    const joined = args.join(' ');
    let artist, title;

    // Parseo flexible: "Artista - Título" o "Artista Título"
    if (joined.includes('-')) {
      const parts = joined.split('-');
      artist = parts[0].trim();
      title = parts.slice(1).join('-').trim();
    } else {
      const words = joined.split(' ');
      if (words.length < 2) return 'Uso: lyrics <artista> - <título>';
      artist = words[0];
      title = words.slice(1).join(' ');
    }

    if (!artist || !title) return 'Uso: lyrics <artista> - <título>';

    const text = await getLyrics(artist, title);
    if (!text) return `No se encontró la letra de «${artist} - ${title}».`;
    return truncate(`🎵 **${artist} — ${title}**\n${text}`, 1990);
  },
};

/* ─── images (Pexels → DuckDuckGo fallback) ─── */
const images = {
  name: 'images',
  aliases: ['imagenes', 'img'],
  category: 'ia/media',
  description: 'Busca imágenes (Pexels o DuckDuckGo).',
  usage: 'images <consulta>',
  async run(message, args) {
    if (!args.length) return 'Uso: images <consulta>';
    const query = args.join(' ');

    // 1) Pexels si hay clave
    if (process.env.PEXELS_API_KEY) {
      try {
        const photos = await searchImages(query, 3);
        if (photos.length) {
          const lines = photos.map((p, i) =>
            `${i + 1}. [ . ](${p.url})${p.alt ? ` ${truncate(p.alt, 80)}` : ''}`
          );
          return truncate(`🖼️ **${query}**\n${lines.join('\n')}`, 1900);
        }
      } catch (e) { /* fallback DuckDuckGo */ }
    }

    // 2) Fallback DuckDuckGo Images (sin clave)
    try {
      const results = await freeImageSearch(query, 3);
      if (!results.length) return 'Sin imágenes para esa búsqueda.';
      const lines = results.map((r, i) =>
        `${i + 1}. [ . ](${r.url})${r.title ? ` ${truncate(r.title, 60)}` : ''}`
      );
      return truncate(`🖼️ **${query}**\n${lines.join('\n')}`, 1900);
    } catch (e) {
      return `No se encontraron imágenes: ${e.message}`;
    }
  },
};

/* ─── song (yt-search, sin API key) ─── */
function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9áéíóúñü\s]/gi, '').trim();
}

const song = {
  name: 'song',
  aliases: ['cancion', 'music'],
  category: 'ia/media',
  description: 'Busca una canción en YouTube (sin API key).',
  usage: 'song <título o artista>',
  async run(message, args) {
    if (!args.length) return 'Uso: song <título o artista>';
    const query = args.join(' ');
    const results = await searchSongs(query, 5);
    if (!results.length) return 'Sin resultados.';

    const nq = normalize(query);
    const best = results[0];
    const nb = normalize(best.title);
    const exact = nb === nq || nb.includes(nq) || nq.includes(nb);

    if (exact) {
      const vfmt = best.views ? `${(best.views / 1000).toFixed(0)}K views` : '';
      const lines = [
        `**${best.title}**`,
        `🎤 ${best.channel}`,
        best.duration ? `⏱ ${best.duration}` : '',
        vfmt ? `👁 ${vfmt}` : '',
        best.ago ? `📅 ${best.ago}` : '',
        `[ . ](${best.url})`,
      ].filter(Boolean);
      return lines.join('\n');
    }

    const lines = results.map((r, i) => {
      const vfmt = r.views ? `${(r.views / 1000).toFixed(0)}K` : '?';
      return `${i + 1}. **${r.title}** — ${r.channel} (${r.duration}, ${vfmt} views)\n   [ . ](${r.url})`;
    });
    return truncate(`🎧 **${query}**\n${lines.join('\n')}`, 1900);
  },
};

/* ─── transcribe (Whisper → HuggingFace fallback) ─── */
const AUDIO_EXTS = /\.(ogg|m4a|wav|mp3|mp4|webp|opus|flac|aac)$/i;
const AUDIO_MIMES = /^audio\//;

const transcribeCmd = {
  name: 'transcribe',
  aliases: ['transcribir'],
  category: 'ia/media',
  description: 'Transcribe un audio adjunto (directo o por respuesta).',
  usage: 'transcribe (adjunta audio o responde a un audio)',
  async run(message) {
    let att = message.attachments && message.attachments.first();

    if (!att && message.reference) {
      try {
        const ref = await message.channel.messages.fetch(message.reference.messageId);
        if (ref && ref.attachments) att = ref.attachments.first();
      } catch (e) { /* noop */ }
    }

    if (!att) return 'Adjunta un archivo de audio o responde a un mensaje con audio.';

    const name = att.name || att.url || '';
    const mime = att.contentType || '';
    const validExt = AUDIO_EXTS.test(name);
    const validMime = AUDIO_MIMES.test(mime);
    if (!validExt && !validMime) return 'Formato no soportado. Usa: .ogg, .mp3, .wav, .m4a, .webm, .opus, .flac, .aac.';

    const text = await transcribe(att.url);
    if (!text) return 'No se pudo transcribir el audio.';
    return truncate(`🎙️ **Transcripción**\n${text}`, 1990);
  },
};

/* ─── ai (Puter.js + OpenAI fallback) ─── */
const ai = {
  name: 'ai',
  aliases: ['ask', 'chat', 'gpt'],
  category: 'ia/media',
  description: 'Chatea con IA (Puter.js con tools o OpenAI).',
  usage: 'ai <pregunta>',
  async run(message, args) {
    if (!args.length) return 'Uso: ai <pregunta>';
    const prompt = args.join(' ');
    const systemMsg = 'Eres un asistente directo y conciso. Responde en el idioma del usuario. Sin preámbulos, sin explicar lo que vas a hacer, ve al grano. Si el usuario pide buscar imágenes, canciones o transcribir audio, usa las herramientas disponibles.';

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
      } catch (e) { /* fallback */ }
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
