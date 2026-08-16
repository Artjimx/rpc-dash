/* ============================================================
   providers/imageSearchProvider.js
   Búsqueda de imágenes con la API real de Pexels.
   Requiere la variable de entorno PEXELS_API_KEY
   (clave gratuita en https://www.pexels.com/api/).
   ============================================================ */

export async function pexelsImages(query, perPage = 3) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('Falta la variable de entorno PEXELS_API_KEY (clave en https://www.pexels.com/api/).');
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels: HTTP ${res.status}`);
  const data = await res.json();
  return (data.photos || []).map((p) => ({
    url: (p.src && p.src.large) || '',
    alt: p.alt || '',
    photographer: p.photographer || '',
  }));
}
