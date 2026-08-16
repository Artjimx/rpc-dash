/* ============================================================
   providers/searchProvider.js
   Búsqueda web con la API Instant Answer de DuckDuckGo.
   Endpoint real y público (sin clave): api.duckduckgo.com
   ============================================================ */

export async function duckDuckGo(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DuckDuckGo: HTTP ${res.status}`);
  const data = await res.json();
  const text = String(data.AbstractText || data.Answer || '').trim();
  if (text) return { text, url: data.AbstractURL || '' };
  if (Array.isArray(data.RelatedTopics)) {
    for (const t of data.RelatedTopics) {
      if (t && t.Text && t.FirstURL) return { text: String(t.Text).trim(), url: t.FirstURL };
    }
  }
  return null;
}
