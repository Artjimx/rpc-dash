/* ============================================================
   utils/permissions.js
   Validación de permisos del selfbot.
   - En un selfbot la cuenta propia es siempre el dueño.
   - ownerId en config añade una cuenta externa permitida.
   ============================================================ */

export function isOwner(client, message, config) {
  if (!message || !message.author) return false;
  const id = message.author.id;
  const ownerId = String((config && config.ownerId) || '').trim();
  if (ownerId && id === ownerId) return true;
  if (client.user && id === client.user.id) return true;
  return false;
}

export function canManage(message, client, config) {
  return isOwner(client, message, config);
}
