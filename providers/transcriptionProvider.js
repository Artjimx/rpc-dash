/* ============================================================
   providers/transcriptionProvider.js
   Transcripción de audio con Whisper de OpenAI.
   Requiere la variable de entorno OPENAI_API_KEY
   (clave en https://platform.openai.com/api-keys).
   ============================================================ */

export async function transcribeAudio(audioUrl, language) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta la variable de entorno OPENAI_API_KEY (OpenAI Whisper).');

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`No se pudo descargar el audio: HTTP ${audioRes.status}`);
  const buffer = Buffer.from(await audioRes.arrayBuffer());

  const form = new FormData();
  form.append('file', new Blob([buffer]), 'audio');
  form.append('model', 'whisper-1');
  if (language) form.append('language', language);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper: HTTP ${res.status}`);
  const data = await res.json();
  return String(data.text || '').trim() || null;
}
