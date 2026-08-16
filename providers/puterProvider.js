/* ============================================================
   providers/puterProvider.js
   Proveedor OPCIONAL para Puter (https://puter.com).
   - No se usa por defecto: el comando .ai usa OpenAI.
   - Requiere PUTER_API_KEY y, si el endpoint cambia,
     PUTER_API_BASE (por defecto https://api.puter.com/v1).
   - Verifica la ruta exacta en la documentación actual de
     Puter antes de activarlo.
   ============================================================ */

export async function puterChat(messages, model = 'gpt-4o-mini') {
  const key = process.env.PUTER_API_KEY;
  if (!key) throw new Error('Falta la variable de entorno PUTER_API_KEY (Puter).');
  const base = String(process.env.PUTER_API_BASE || 'https://api.puter.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`Puter: HTTP ${res.status}`);
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return String(content || '').trim() || null;
}
