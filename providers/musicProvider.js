/* ============================================================
   providers/musicProvider.js
   Búsqueda de canciones con la YouTube Data API v3.
   Requiere la variable de entorno YOUTUBE_API_KEY
   (clave gratuita en https://console.cloud.google.com/apis).
   ============================================================ */

export async function youtubeSearch(query, maxResults = 3) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('Falta la variable de entorno YOUTUBE_API_KEY (YouTube Data API v3).');
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube: HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => ({
    title: (it.snippet && it.snippet.title) || '',
    channel: (it.snippet && it.snippet.channelTitle) || '',
    url: it.id && it.id.videoId ? `https://www.youtube.com/watch?v=${it.id.videoId}` : '',
  }));
}
