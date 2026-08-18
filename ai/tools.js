/* ============================================================
   ai/tools.js
   Tools/function calling para la IA:
   - search_images: imágenes (DuckDuckGo sin clave, o Pexels)
   - search_songs: canciones en YouTube (yt-search)
   - transcribe_audio: audio a texto (Whisper/HuggingFace)
   ============================================================ */

import { freeImageSearch } from '../providers/freeImageSearch.js';
import { searchSongs } from '../ai/musicService.js';
import { transcribe } from '../ai/transcriptionService.js';

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
      return results.map((r) => `${r.title}: [ . ](${r.url})`).join('\n') || 'Sin resultados.';
    }
    case 'search_songs': {
      const results = await searchSongs(args.query, 3);
      return results.map((r) => `${r.title} — ${r.channel}: ${r.url}`).join('\n') || 'Sin resultados.';
    }
    case 'transcribe_audio': {
      try {
        const text = await transcribe(args.audio_url);
        return text || 'No se pudo transcribir el audio.';
      } catch (e) {
        return `Error de transcripción: ${e.message}`;
      }
    }
    default:
      return `Herramienta desconocida: ${name}`;
  }
}
