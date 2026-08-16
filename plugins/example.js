/* ============================================================
   plugins/example.js — PLUGIN DE EJEMPLO (seguro y no destructivo)
   Responde con un saludo cuando alguien escribe «hola» y el
   bot está presente en el canal. Muestra cómo extender el
   selfbot sin tocar el core.
   ============================================================ */

export default {
  name: 'ejemplo-saludos',

  onReady(client, ctx) {
    // Hook de inicio: aquí se podría registrar timers, etc.
  },

  async onMessage(message, ctx) {
    if (message.author && message.author.id === message.client.user.id) return;
    if (!message.content) return;
    const text = message.content.toLowerCase();
    if (/^(hola|hello|hey)\b/.test(text)) {
      try {
        await message.reply('¡Hola! 👋 Soy el selfbot de comandos de Presence OS.');
      } catch (e) { /* noop */ }
    }
  },
};
