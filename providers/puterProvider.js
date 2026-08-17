/* ============================================================
   providers/puterProvider.js
   Chat IA con Puter.js (gratis, sin API key propia).
   Requiere PUTER_AUTH_TOKEN en .env (cuenta Puter del usuario).
   Soporta function calling con tools.
   ============================================================ */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let _puter = null;

function getPuter() {
  if (_puter) return _puter;
  const token = process.env.PUTER_AUTH_TOKEN;
  if (!token) throw new Error('Falta PUTER_AUTH_TOKEN. Inicia sesión en puter.com y exporta tu token.');
  const { init } = require('@heyputer/puter.js/src/init.cjs');
  _puter = init(token);
  return _puter;
}

export async function puterChat(messages, model = 'openai/gpt-5.5', tools = null) {
  const puter = getPuter();
  const lastUser = messages.filter((m) => m.role === 'user').pop();
  if (!lastUser) throw new Error('Sin mensaje del usuario.');
  const opts = { model };
  if (tools) opts.tools = tools;
  const response = await puter.ai.chat(lastUser.content, opts);
  return response;
}

export function parsePuterResponse(response) {
  if (typeof response === 'string') return { text: response, toolCalls: null };
  const text = response?.message?.content || response?.text || (typeof response === 'string' ? response : '');
  const toolCalls = response?.message?.tool_calls || null;
  return { text: String(text || '').trim(), toolCalls };
}
