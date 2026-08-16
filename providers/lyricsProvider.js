/* ============================================================
   providers/lyricsProvider.js
   Letras de canciones con la API pública lyrics.ovh.
   Endpoint real: api.lyrics.ovh/v1/{artista}/{titulo}
   ============================================================ */

export async function lyricsOvh(artist, title) {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lyrics.ovh: HTTP ${res.status}`);
  const data = await res.json();
  return String(data.lyrics || '').trim() || null;
}
