/* ============================================================
   providers/lyricsProvider.js
   Letras de canciones con LrcLib (lrclib.net).
   API pública, sin clave. Devuelve letras sincronizadas (.lrc)
   o texto plano.
   ============================================================ */

export async function getLyrics(artist, title) {
  const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LrcLib: HTTP ${res.status}`);
  const data = await res.json();
  // Prefiere歌词 sincronizada, fallback a plain
  const synced = String(data.syncedLyrics || '').trim();
  if (synced) return synced;
  const plain = String(data.plainLyrics || '').trim();
  return plain || null;
}
