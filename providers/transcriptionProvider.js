/* ============================================================
   providers/transcriptionProvider.js
   Transcripción de audio:
   1. OpenAI Whisper (si OPENAI_API_KEY existe)
   2. Fallback: HuggingFace Inference API (gratuita, sin clave)
   ============================================================ */

const HF_MODEL = 'openai/whisper-large-v3';

export async function transcribeAudio(audioUrl, language) {
  // 1) OpenAI Whisper
  if (process.env.OPENAI_API_KEY) {
    try {
      return await _openaiWhisper(audioUrl, language);
    } catch (e) { /* fallback HuggingFace */ }
  }

  // 2) HuggingFace Inference (gratuita)
  return await _huggingFaceWhisper(audioUrl);
}

async function _openaiWhisper(audioUrl, language) {
  const key = process.env.OPENAI_API_KEY;
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

async function _huggingFaceWhisper(audioUrl) {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`No se pudo descargar el audio: HTTP ${audioRes.status}`);
  const buffer = Buffer.from(await audioRes.arrayBuffer());

  const res = await fetch(
    `https://api-inference.huggingface.co/models/${HF_MODEL}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!res.ok) throw new Error(`HuggingFace: HTTP ${res.status}`);
  const data = await res.json();
  return String(data.text || '').trim() || null;
}
