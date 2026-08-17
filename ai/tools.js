/* ============================================================
   ai/tools.js
   Tools/function calling para la IA:
   - search_images: busca imágenes (DuckDuckGo sin clave, o Pexels)
   - search_songs: busca canciones en YouTube
   - transcribe: transcribe audio (puter.ai.speech2txt o Whisper)
   ============================================================ */

import { freeImageSearch } from '../providers/freeImageSearch.js';
import { searchSongs } from '../ai/musicService.js';

export const aiTools = [
  {
    type: 'function',
    function: {
      name: 'search_images',
      description: 'Busca imágenes en la web por texto. Devuelve URLs de imágenes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto de búsqueda de imágenes' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_songs',
      description: 'Busca canciones o videos en YouTube por título o artista.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Título o artista de la canción' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description: 'Transcribe un archivo de audio a texto.',
      parameters: {
        type: 'object',
        properties: {
          audio_url: { type: 'string', description: 'URL del archivo de audio' },
        },
        required: ['audio_url'],
      },
    },
  },
];

export async function executeTool(name, args) {
  switch (name) {
    case 'search_images': {
      const results = await freeImageSearch(args.query, 3);
      return results.map((r) => `${r.title}: ${r.url}`).join('\n') || 'Sin resultados.';
    }
    case 'search_songs': {
      const results = await searchSongs(args.query, 3);
      return results.map((r) => `${r.title} — ${r.channel}: ${r.url}`).join('\n') || 'Sin resultados.';
    }
    case 'transcribe_audio': {
      // Puter.js speech2txt o fallback
      if (process.env.PUTER_AUTH_TOKEN) {
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        const { init } = require('@heyputer/puter.js/src/init.cjs');
        const puter = init(process.env.PUTER_AUTH_TOKEN);
        const result = await puter.ai.speech2txt(args.audio_url);
        return typeof result === 'string' ? result : result?.text || JSON.stringify(result);
      }
      return 'Transcripción requiere PUTER_AUTH_TOKEN.';
    }
    default:
      return `Herramienta desconocida: ${name}`;
  }
}
