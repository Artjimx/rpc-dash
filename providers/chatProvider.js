/* ============================================================
   providers/chatProvider.js
   Chat IA con la API oficial de OpenAI (chat completions).
   Requiere OPENAI_API_KEY.
   ============================================================ */

export async function openAiChat(messages, model = 'gpt-4o-mini') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta la variable de entorno OPENAI_API_KEY (OpenAI).');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI: HTTP ${res.status} ${detail.slice(0, 120)}`);
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return String(content || '').trim() || null;
}
