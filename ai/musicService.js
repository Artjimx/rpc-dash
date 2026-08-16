/* ai/musicService.js — canciones (YouTube) y letras (lyrics.ovh). */
import { youtubeSearch } from '../providers/musicProvider.js';
import { lyricsOvh } from '../providers/lyricsProvider.js';

export { youtubeSearch as searchSongs, lyricsOvh as getLyrics };
