/* ============================================================
   providers/freeImageSearch.js
   Búsqueda de imágenes con DuckDuckGo (sin clave).
   ============================================================ */

export async function freeImageSearch(query, count = 3) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const tokenRes = await fetch('https://duckduckgo.com/?q=' + encodeURIComponent(query), {
    headers: { 'User-Agent': ua },
    signal: AbortSignal.timeout(12000),
  });
  const html = await tokenRes.text();
  const vqdMatch = html.match(/vqd=['"]?([a-zA-Z0-9_-]+)/);
  if (!vqdMatch) throw new Error('No se pudo obtener token de búsqueda.');
  const vqd = vqdMatch[1];
  const searchRes = await fetch(
    'https://duckduckgo.com/i.js?q=' + encodeURIComponent(query) + '&vqd=' + vqd + '&l=wt-wt&o=json',
    { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(12000) },
  );
  if (!searchRes.ok) throw new Error(`DuckDuckGo images: HTTP ${searchRes.status}`);
  const data = await searchRes.json();
  return (data.results || []).slice(0, count).map((r) => ({
    url: r.image || '',
    thumb: r.thumbnail || '',
    title: r.title || '',
    source: r.source || '',
  }));
}
