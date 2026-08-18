/* ============================================================
   providers/musicProvider.js
   Búsqueda de canciones con yt-search (sin API key).
   Devuelve los primeros N resultados con metadata extendida.
   ============================================================ */

import ytSearch from 'yt-search';

export async function searchSongs(query, maxResults = 5) {
  const results = await ytSearch(query);
  const videos = (results.videos || []).slice(0, maxResults);
  return videos.map((v) => ({
    title: v.title || '',
    channel: v.author && v.author.name ? v.author.name : '',
    url: v.url || '',
    duration: v.timestamp || '',
    views: v.views || 0,
    ago: v.ago || '',
  }));
}
