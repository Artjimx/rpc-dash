/* ============================================================
   providers/searchProvider.js
   Búsqueda web con DuckDuckGo.
   Primero intenta Instant Answer API, luego fallback HTML.
   ============================================================ */

export async function duckDuckGo(query) {
  // 1) Instant Answer API
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const text = String(data.AbstractText || data.Answer || '').trim();
      if (text) return { text, url: data.AbstractURL || '' };
      if (Array.isArray(data.RelatedTopics)) {
        for (const t of data.RelatedTopics) {
          if (t && t.Text && t.FirstURL) return { text: String(t.Text).trim(), url: t.FirstURL };
        }
      }
    }
  } catch (e) { /* fallback */ }

  // 2) Fallback: DuckDuckGo HTML lite
  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const r = await fetch('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query), {
      headers: { 'User-Agent': ua },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const results = [];
    const linkRe = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let m;
    while ((m = linkRe.exec(html)) && results.length < 3) {
      const url = m[1].trim();
      const title = m[2].trim();
      if (url && title && url.startsWith('http')) results.push({ text: title, url });
    }
    // Fallback más simple: buscar cualquier link con texto
    if (!results.length) {
      const simpleRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>\s*([^<]{10,80})\s*<\/a>/gi;
      while ((m = simpleRe.exec(html)) && results.length < 3) {
        const url = m[1].trim();
        const title = m[2].trim();
        if (url && title && !url.includes('duckduckgo.com')) results.push({ text: title, url });
      }
    }
    if (results.length) return { text: results.map((r) => `${r.text}\n${r.url}`).join('\n\n'), url: results[0].url };
  } catch (e) { /* noop */ }

  return null;
}
