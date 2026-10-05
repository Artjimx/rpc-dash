/* ============================================================
   discordProfile.js — Hidratar el perfil real de la cuenta.

   El preview del dashboard tiene que parecerse a lo que Discord
   muestra de verdad, así que en vez de inventar un avatar y un nombre
   se consultan los datos reales de la cuenta con /users/@me.

   Todos los bits de las insignias están copiados de
   discord-api-types (UserFlags) que ya está instalado como
   dependencia, para no escribirlos de memoria.
   ============================================================ */

const API_BASE = 'https://discord.com/api/v10';
const CDN = 'https://cdn.discordapp.com';

/* Bits de UserFlags verificados en node_modules/discord-api-types. */
const USER_FLAGS = {
  Staff: 1,
  Partner: 2,
  Hypesquad: 4,
  BugHunterLevel1: 8,
  MFASMS: 16,
  PremiumPromoDismissed: 32,
  HypeSquadOnlineHouse1: 64,
  HypeSquadOnlineHouse2: 128,
  HypeSquadOnlineHouse3: 256,
  PremiumEarlySupporter: 512,
  TeamPseudoUser: 1024,
  HasUnreadUrgentMessages: 8192,
  BugHunterLevel2: 16384,
  VerifiedBot: 65536,
  VerifiedDeveloper: 131072,
  CertifiedModerator: 262144,
  BotHTTPInteractions: 524288,
  Spammer: 1048576,
  DisablePremium: 2097152,
  ActiveDeveloper: 4194304,
};

/* Insignias que Discord muestra en la tarjeta de perfil, en el orden
   en que las pinta la web. Cada una lleva su tooltip. */
const BADGES = [
  { flag: USER_FLAGS.Staff, name: 'Discord Staff', color: '#5865f2' },
  { flag: USER_FLAGS.Partner, name: 'Partnered Server Owner', color: '#5865f2' },
  { flag: USER_FLAGS.Hypesquad, name: 'HypeSquad Events', color: '#f9a62b' },
  { flag: USER_FLAGS.BugHunterLevel1, name: 'Bug Hunter Level 1', color: '#3ba55c' },
  { flag: USER_FLAGS.HypeSquadOnlineHouse1, name: 'HypeSquad Bravery', color: '#9c84ef' },
  { flag: USER_FLAGS.HypeSquadOnlineHouse2, name: 'HypeSquad Brilliance', color: '#f47fff' },
  { flag: USER_FLAGS.HypeSquadOnlineHouse3, name: 'HypeSquad Balance', color: '#45ddff' },
  { flag: USER_FLAGS.PremiumEarlySupporter, name: 'Early Supporter', color: '#ff73fa' },
  { flag: USER_FLAGS.BugHunterLevel2, name: 'Bug Hunter Level 2', color: '#3ba55c' },
  { flag: USER_FLAGS.VerifiedBot, name: 'Early Verified Bot Developer', color: '#5865f2' },
  { flag: USER_FLAGS.VerifiedDeveloper, name: 'Early Verified Bot Developer', color: '#5865f2' },
  { flag: USER_FLAGS.CertifiedModerator, name: 'Moderator Programs Alumni', color: '#3ba55c' },
  { flag: USER_FLAGS.ActiveDeveloper, name: 'Active Developer', color: '#3ba55c' },
];

/* Un hash que empieza por "a_" es un avatar animado: hay que pedir .gif
   o Discord devuelve un PNG fijo y la animación no se ve. */
function avatarUrl(userId, hash, size = 160) {
  if (!userId || !hash) return null;
  const ext = String(hash).startsWith('a_') ? 'gif' : 'png';
  return `${CDN}/avatars/${userId}/${hash}.${ext}?size=${size}`;
}

function bannerUrl(userId, hash, size = 600) {
  if (!userId || !hash) return null;
  const ext = String(hash).startsWith('a_') ? 'gif' : 'png';
  return `${CDN}/banners/${userId}/${hash}.${ext}?size=${size}`;
}

/* El avatar por defecto de Discord es un degradado derivado del id,
   así que se calcula aquí para que el preview no se vea vacío cuando la
   cuenta no tiene avatar. */
function defaultAvatarGradient(userId) {
  const id = String(userId || '');
  let a = 0;
  let b = 0;
  for (let i = 0; i < id.length; i++) {
    a = (a * 31 + id.charCodeAt(i)) % 360;
    b = (b * 17 + id.charCodeAt(i) * 3) % 360;
  }
  return `linear-gradient(135deg,hsl(${a} 70% 45%),hsl(${b} 70% 30%))`;
}

/** Convierte la respuesta de /users/@me en algo que el front pueda pintar. */
export function shapeProfile(user, customStatusText = '') {
  if (!user || !user.id) return null;

  const flags = Number(user.flags || 0) | 0;
  const badges = BADGES
    .filter((b) => (flags & b.flag) === b.flag && b.flag !== 0)
    .map((b) => ({ name: b.name, color: b.color }));

  /* Nitro no viene en flags: va en premium_type (0 ninguno,
     1 clásico, 2 full, 3 basic). */
  const premium = Number(user.premium_type || 0);
  if (premium > 0) {
    badges.unshift({ name: premium === 2 ? 'Nitro' : 'Nitro Basic', color: '#ff73fa' });
  }

  /* El "tag" legacy solo existe si el nombre tiene discriminador. */
  const legacy = user.discriminator && user.discriminator !== '0'
    ? `${user.username}#${user.discriminator}`
    : null;

  /* global_name es el nombre dedisplay; si no hay, Discord muestra el
     username. accent_color va como entero sin signo. */
  const accent = Number.isFinite(Number(user.accent_color)) && user.accent_color !== null && user.accent_color !== undefined
    ? Number(user.accent_color)
    : null;

  let decoration = null;
  const dec = user.avatar_decoration_data || (user.avatar_decoration ? { asset: user.avatar_decoration } : null);
  if (dec && dec.asset) {
    decoration = `${CDN}/avatar-decoration-presets/${dec.asset}.png?size=160`;
  }

  return {
    id: user.id,
    username: user.username || '',
    displayName: user.global_name || user.username || '',
    discriminator: user.discriminator || '0',
    legacyTag: legacy,
    avatar: avatarUrl(user.id, user.avatar),
    avatarFallback: defaultAvatarGradient(user.id),
    banner: bannerUrl(user.id, user.banner),
    /* Discord usa un morado fijo cuando la cuenta no tiene banner. */
    bannerFallback: '#4e2a8a',
    accentColor: accent,
    avatarDecoration: decoration,
    badges,
    premiumType: premium,
    customStatus: customStatusText || '',
  };
}

/**
 * Consulta /users/@me y devuelve el perfil ya moldeado.
 * Cache corto: el avatar o el nombre cambian muy rara vez y así el
 * preview no pega una petición cada vez que el dashboard se recarga.
 */
export async function fetchOwnProfile(token, { customStatusText = '', ttlMs = 300000 } = {}) {
  if (!token) throw new Error('no hay USER_TOKEN configurado');

  const now = Date.now();
  if (profileCache.token === token && now - profileCache.at < ttlMs && profileCache.data) {
    return profileCache.data;
  }

  const res = await fetch(`${API_BASE}/users/@me`, {
    headers: { Authorization: token },
  });

  if (!res.ok) {
    let message = `Discord respondió ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.message) message += `: ${body.message}`;
    } catch { /* cuerpo no JSON */ }
    if (res.status === 401) message = 'el USER_TOKEN fue rechazado por Discord (401)';
    throw new Error(message);
  }

  const user = await res.json();
  const shaped = shapeProfile(user, customStatusText);
  profileCache = { token, at: now, data: shaped };
  return shaped;
}

let profileCache = { token: null, at: 0, data: null };

/** Se llama al conectar o al cambiar de token para no servir datos viejos. */
export function clearProfileCache() {
  profileCache = { token: null, at: 0, data: null };
}

/* Se exporta para poder comprobarlas en las pruebas. */
export const internals = { USER_FLAGS, BADGES, avatarUrl, bannerUrl, defaultAvatarGradient };