/* ============================================================
   PRESENCE·OS v2 — index.js
   Express + Socket.io + discord.js-selfbot-v13 (Rich Presence
   por USER_TOKEN)

   Correcciones v2.1:
   1) Imágenes RPC sin «?»: la serialización correcta exige que
      `client.presence.userId` coincida con `client.user.id` para
      que las actividades se emitan como RichPresence (snake_case
      `application_id`, `session_id`). Sin eso Discord no puede
      resolver la aplicación y las imágenes quedan en «?».
      Las URLs externas se registran con `RichPresence.getExternal`
      (oficial, con caché) y, si no hay App ID, caen al proxy `mp:`.
   2) Custom Status de perfil independiente (emoji + texto) con
      rotación de estados de perfil vía `client.settings.setCustomStatus`.
    4) Persistencia total en data/settings.json + localStorage.

   Correcciones v2.2:
   5) Custom Status de perfil con emojis personalizados de Discord:
      acepta <:nombre:id> y <a:nombre:id>, o el objeto { name, id,
      animated }, y los aplica vía CustomStatus.setEmoji para que
      Discord reciba emoji_id y el emoji aparezca en el perfil real.
   ============================================================ */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, RichPresence, CustomStatus, Intents, Constants } from 'discord.js-selfbot-v13';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SERVER_PORT) || Number(process.env.PORT) || 3000;

const app = express();
/* Cloud-ready: confía en el proxy inverso (Heroku/Render/Railway) para
   que req.protocol/ip y Socket.io se comporten correctamente. */
app.set('trust proxy', true);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ============================================================
   Subida de imágenes locales (multer → public/uploads)
   ============================================================ */

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (err) {
  console.error('[UPLOADS] no se pudo crear public/uploads:', err.message);
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i;

const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = IMAGE_EXT.test(path.extname(file.originalname || ''))
        ? path.extname(file.originalname).toLowerCase()
        : '.jpg';
      cb(null, `imagen-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okExt = IMAGE_EXT.test(path.extname(file.originalname || ''));
    const okMime = /^image\//.test(String(file.mimetype || ''));
    if (!okExt && !okMime) {
      return cb(new Error('Solo se permiten imágenes (jpg, jpeg, gif, webp, avif).'), false);
    }
    cb(null, true);
  },
});

/* ============================================================
   Persistencia de ajustes (data/settings.json)
   ============================================================ */

const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  userToken: '',
  applicationId: '',
  name: '',
  type: 'playing',
  platform: 'desktop',
  status: 'online',
  streamUrl: '',
  details: '',
  state: '',
  partyId: '',
  partySize: '',
  partyMax: '',
  startTimestamp: '',
  endTimestamp: '',
  largeImageUrl: '',
  largeImageText: '',
  smallImageUrl: '',
  smallImageText: '',
  button1Text: '',
  button1Url: '',
  button2Text: '',
  button2Url: '',
  profileStatuses: [],
  profileRotationSeconds: 60,
};

/* Semilla opcional: si SEED_SETTINGS_JSON existe y no hay
   data/settings.json, se crea con esos valores al arrancar.
   Deja la configuración (incluido USER_TOKEN) ya puesta en el host
   sin commitear secretos al repo (la variable es secreta en el panel). */
const SEED_SETTINGS_JSON = process.env.SEED_SETTINGS_JSON || '';

function seedSettingsFromEnv() {
  if (!SEED_SETTINGS_JSON) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) {
      const seeded = { ...DEFAULT_SETTINGS, ...JSON.parse(SEED_SETTINGS_JSON) };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(seeded, null, 2), 'utf8');
      console.log('[SETTINGS] inicializado desde SEED_SETTINGS_JSON');
    }
  } catch (err) {
    console.error('[SETTINGS] SEED_SETTINGS_JSON inválido, ignorado:', err.message);
  }
}
seedSettingsFromEnv();

function loadSettings() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch (err) {
    console.error('[SETTINGS] error de lectura:', err.message);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[SETTINGS] error al guardar:', err.message);
  }
}

const SETTING_FIELDS = [
  'enabled', 'userToken', 'applicationId', 'name', 'type', 'platform', 'status', 'streamUrl',
  'details', 'state', 'partyId', 'partySize', 'partyMax', 'startTimestamp', 'endTimestamp',
  'largeImageUrl', 'largeImageText', 'smallImageUrl', 'smallImageText',
  'button1Text', 'button1Url', 'button2Text', 'button2Url',
];

function persistSettings(body) {
  const next = loadSettings();
  for (const k of SETTING_FIELDS) {
    if (body[k] === undefined) continue;
    const val = typeof body[k] === 'string' ? body[k].trim() : body[k];
    /* El token no se borra con un valor vacío: evita que un navegador
       sin token guardado localmente sobrescriba el de settings.json. */
    if (k === 'userToken' && (val === '' || val == null)) continue;
    next[k] = val === undefined || val === null ? '' : val;
  }
  if (Array.isArray(body.profileStatuses)) next.profileStatuses = body.profileStatuses;
  if (body.profileRotationSeconds !== undefined) next.profileRotationSeconds = Number(body.profileRotationSeconds) || 60;
  saveSettings(next);
  return next;
}

/* ============================================================
   Controlador de Discord (discord.js-selfbot-v13)
   ============================================================ */

const USER_TOKEN_ENV = String(process.env.USER_TOKEN || process.env.DISCORD_USER_TOKEN || '').trim();

let client = null;
let connectedToken = null;
let connecting = null;
let currentActivity = null;
let rpcState = { connected: false, clientId: null, error: null, updatedAt: null, verified: null, appliedActivity: [], sentActivity: [] };

/* Auto-reconexión: Discord cierra la sesión de los selfbots a menudo
   (sobre todo desde IPs de datacenter). Sin esto el RPC queda caído
   hasta que reconectas a mano. Backoff exponencial con tope. */
let reconnectTimer = null;
let reconnectAttempts = 0;
let userDisconnected = false;
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;

const FIELDS = [
  'enabled', 'userToken', 'profileName', 'applicationId', 'name', 'type', 'details', 'state',
  'partyId', 'partySize', 'partyMax', 'startTimestamp', 'endTimestamp',
  'platform', 'status', 'streamUrl',
  'largeImageUrl', 'largeImageText', 'smallImageUrl', 'smallImageText',
  'button1Text', 'button1Url', 'button2Text', 'button2Url',
];

function cleanActivity(body) {
  const out = {};
  for (const k of FIELDS) {
    const v = body[k];
    /* Se distingue "campo ausente" (undefined -> no tocar) de "campo
       presente pero vacio" ('' -> cadena vacia) para que vaciar un campo
       desde la dashboard lo borre de verdad en vez de conservar el valor
       anterior de settings.json. */
    if (v === undefined) { out[k] = undefined; continue; }
    if (typeof v === 'string') { out[k] = v.trim(); continue; }
    out[k] = v;
  }
  /* Normaliza URLs para no guardar (ni enviar a Discord) variantes
     rotas como «https://https://…» que se descartan en silencio. */
  const urlKeys = { streamUrl: false, button1Url: false, button2Url: false };
  for (const [k, allowHttp] of Object.entries(urlKeys)) {
    if (out[k]) out[k] = normalizeUrl(out[k], allowHttp) || undefined;
  }
  return out;
}

function resolveToken(fromActivity, settings) {
  const candidates = [fromActivity && fromActivity.userToken, settings && settings.userToken, USER_TOKEN_ENV];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

const ACTIVITY_TYPES = Constants.ActivityTypes || {
  PLAYING: 0, STREAMING: 1, LISTENING: 2, WATCHING: 3, COMPETING: 5,
};

const TYPE_BY_NAME = {
  playing: ACTIVITY_TYPES.PLAYING,
  streaming: ACTIVITY_TYPES.STREAMING,
  listening: ACTIVITY_TYPES.LISTENING,
  watching: ACTIVITY_TYPES.WATCHING,
  competing: ACTIVITY_TYPES.COMPETING,
};

const STATUS_MAP = {
  online: 'online',
  idle: 'idle',
  dnd: 'dnd',
  offline: 'invisible',
  invisible: 'invisible',
};

const PLATFORM_MAP = {
  desktop: 'desktop',
  android: 'android',
  ios: 'ios',
  embedded: 'embedded',
  samsung: 'samsung',
  xbox: 'xbox',
  playstation_4: 'ps4',
  playstation_5: 'ps5',
};
const VALID_PLATFORMS = new Set(['desktop', 'samsung', 'xbox', 'ios', 'android', 'embedded', 'ps4', 'ps5']);

/* Plataformas cuyo cliente de Discord renderiza botones RPC.
   Consolas (ps4/ps5/xbox) y TVs (samsung) no los muestran: en esas
   plataformas los botones se omiten (nunca rompen el streaming). */
const BUTTON_PLATFORMS = new Set(['desktop', 'embedded', 'android', 'ios']);

/* ============================================================
   Logging (consola de Node)
   ============================================================ */

function ts() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

const log = {
  info(msg) { console.log(`[${ts()}] [INFO]  ${msg}`); },
  ok(msg) { console.log(`[${ts()}] [ OK ]  ${msg}`); },
  warn(msg) { console.log(`[${ts()}] [WARN]  ${msg}`); },
  error(msg) { console.error(`[${ts()}] [ERROR] ${msg}`); },
  rpc(msg, payload) {
    console.log(`[${ts()}] [RPC→]  ${msg}`);
    console.log(JSON.stringify(payload, null, 2));
  },
};

function describeTokenError(err) {
  const m = String((err && err.message) || err || 'Error desconocido');
  if (/invalid token|unauthorized|4004|401/i.test(m)) {
    return 'Token inválido o rechazado por Discord (HTTP 401). Revisa el USER_TOKEN y vuelve a intentarlo.';
  }
  if (/disallowed|forbidden|403/i.test(m)) {
    return 'Token rechazado por Discord (HTTP 403): puede haber sido revocado.';
  }
  if (/rate|too many|429/i.test(m)) {
    return 'Demasiadas conexiones a Discord (429). Espera unos segundos y reintenta.';
  }
  return 'No se pudo conectar con Discord: ' + m;
}

function describeRpcError(err) {
  const m = String((err && err.message) || err || 'Error desconocido');
  if (/invalid token|unauthorized|4004|401/i.test(m)) return describeTokenError(err);
  if (/rate|too many|429/i.test(m)) return describeTokenError(err);
  if (/connection closed|refused|enoent|socket hang up|end of file|ECONNRESET|gateway|websocket|disconnected/i.test(m)) {
    return 'No se pudo mantener la conexión con Discord (red o sesión cerrada). Reintenta o revisa tu token.';
  }
  return m;
}

function normalizeUrl(value, allowHttp) {
  if (typeof value !== 'string') return '';
  let v = value.trim();
  if (!v) return '';
  /* Elimina «https://https://...», «https://http://...», espacios raros,
     tabuladores y comas que rompen la URL y hacen que Discord descarte
     el botón / la stream silentemente. */
  v = v.replace(/\s+/g, '').replace(/,+$/, '').replace(/,+/g, '');
  let cleaned = v;
  for (let i = 0; i < 3; i++) {
    if (/^(https?:\/\/)+(https?:\/\/)/i.test(cleaned)) {
      cleaned = cleaned.replace(/^(https?:\/\/)+/i, (m) => (allowHttp ? m.slice(0, m.indexOf('//') + 2) : 'https://'));
    } else break;
  }
  /* Empieza sin esquema (ej. arcase-production.up.railway.app) → asume https. */
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)) cleaned = 'https://' + cleaned;
  try {
    const u = new URL(cleaned);
    if (!/^https?:$/i.test(u.protocol)) return '';
    if (!u.hostname || !u.hostname.includes('.')) return '';
    return allowHttp || u.protocol === 'https:' ? u.toString() : '';
  } catch (e) {
    return '';
  }
}

function isValidStreamUrl(url) {
  return !!normalizeUrl(url, false) && /twitch\.tv|youtube\.com|youtu\.be/i.test(url);
}

function validateActivity(a) {
  /* Filosofía: el modo streaming PRESENTA siempre lo configurado. El
     servidor nunca bloquea por plataforma ni oculta el streaming por
     decisión propia: si algo no aparece es porque el usuario no llenó
     ese campo, y solo se avisa (warning), jamás se rechaza. */
  const warnings = [];
  const type = TYPE_BY_NAME[String(a.type || '').toLowerCase()];
  const stream = normalizeUrl(a.streamUrl, false);

  if (type === ACTIVITY_TYPES.STREAMING) {
    if (!stream) {
      warnings.push('Streaming: falta la «Stream URL» (ej. https://twitch.tv/usuario). La actividad se publica como streaming pero sin URL Discord no muestra el enlace.');
    } else if (!/twitch\.tv|youtube\.com|youtu\.be/i.test(stream)) {
      /* Discord renderiza el enlace de streaming solo con dominios
         Twitch/YouTube; con otro dominio el streaming aún se muestra,
         solo sin el botón/enlace de la transmisión. */
      warnings.push('Streaming: Discord solo enlaza la transmisión con Twitch o YouTube (ej. https://twitch.tv/usuario). El streaming se sigue presentando.');
    }
  }

  const hasImage = !!(a.largeImageUrl && normalizeUrl(a.largeImageUrl, true)) ||
                   !!(a.smallImageUrl && normalizeUrl(a.smallImageUrl, true));
  if (hasImage && !isValidAppId(a.applicationId)) {
    warnings.push('Imágenes requieren un «App ID» válido (17-20 dígitos): sin él Discord no renderiza la imagen, solo el nombre y detalles.');
  }

  const platform = PLATFORM_MAP[String(a.platform || '').toLowerCase()];
  const hasBtn = (a.button1Text && normalizeUrl(a.button1Url, false)) ||
                 (a.button2Text && normalizeUrl(a.button2Url, false));
  if (hasBtn) {
    if (platform && !BUTTON_PLATFORMS.has(platform)) {
      warnings.push(`Botones omitidos: la plataforma «${a.platform}» no los soporta (consolas/TV). El streaming se publica igual.`);
    } else if (!isValidAppId(a.applicationId)) {
      warnings.push('Botones: Discord solo los muestra con un «App ID» válido y una aplicación validada en el Developer Portal.');
    }
  }

  return { problems: [], warnings };
}

function toMs(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  const d = new Date(v).getTime();
  return Number.isFinite(d) ? d : null;
}

/* ============================================================
   Resolución de imágenes RPC (corrección del «?»)
   ------------------------------------------------------------
   Formas aceptadas por Discord:
   - Asset ID (17-20 dígitos)  -> se deja tal cual
   - mp: / youtube: / spotify: / twitch:  -> proxy directo
   - external/…                -> media proxy (mp:external/…)
   - URL https://…
       · cdn/media.discordapp.net  -> se convierte a mp:
       · cualquier otro host       -> se registra con
         RichPresence.getExternal (oficial, cacheado) y, si eso
         falla o no hay App ID, cae al proxy mp:.
   Devuelve null si el valor es inválido (se conserva la imagen
   anterior en lugar de lanzar el error «INVALID_URL» que ponía
   la imagen en «?»).
   ============================================================ */

const EXTERNAL_CACHE = new Map();

function isValidAppId(id) {
  return /^[0-9]{17,20}$/.test(String(id || '').trim());
}

/* Clave de asset limpia del Developer Portal (nombre, no URL).
   Discord resuelve este string contra los assets de la app. */
const CLEAN_ASSET_KEY = /^[A-Za-z0-9_\-.]{1,128}$/;

async function resolveRichImage(client, value, appId) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  if (isValidAppId(v)) return v;
  if (/^(mp:|youtube:|spotify:|twitch:)/.test(v)) return v;
  if (v.startsWith('external/')) return 'mp:' + v;

  /* Nombre de asset limpio (ej: "bigimage", "logo_2", "icon.main").
     Se acepta tal cual: Discord lo resuelve contra el Developer Portal. */
  if (CLEAN_ASSET_KEY.test(v)) return v;

  if (/^https?:\/\//i.test(v)) {
    /* http:// (sin TLS) Discord lo rechaza → se omite el asset en vez
       de arriesgar el "?" que rompe el RPC. */
    if (/^http:\/\//i.test(v)) {
      log.warn(`Imagen externa http:// no soportada, asset omitido: ${v.slice(0, 80)}`);
      return null;
    }
    if (/cdn\.discordapp\.com|media\.discordapp\.net/i.test(v)) {
      return 'mp:' + v.replace(/^https?:\/\//i, (m) => m.replace('://', '/'));
    }
    if (isValidAppId(appId)) {
      const cached = EXTERNAL_CACHE.get(v);
      if (cached) return cached;
      try {
        const res = await RichPresence.getExternal(client, String(appId).trim(), v);
        const item = Array.isArray(res) ? res[0] : null;
        const ext = item && (item.external_asset_path || item.url);
        if (ext && String(ext).startsWith('external/')) {
          EXTERNAL_CACHE.set(v, 'mp:' + ext);
          log.ok(`Imagen externa registrada: ${v.slice(0, 70)} → ${ext}`);
          return 'mp:' + ext;
        }
        log.warn(`Registro externo sin ruta válida para: ${v.slice(0, 70)} → proxy mp:`);
      } catch (e) {
        log.warn(`Registro externo falló (${e.message}) → proxy mp:`);
      }
    }
    return 'mp:' + v.replace(/^https?:\/\//i, (m) => m.replace('://', '/'));
  }

  log.warn(`Imagen RPC inválida ignorada (asset omitido, sin "?"): ${String(v).slice(0, 80)}`);
  return null;
}

/* ============================================================
   Construcción de actividades (RichPresence / CustomStatus)
   Se aplica la FIX CLAVE en connectRpc(): c.presence.userId =
   c.user.id para que ClientPresence serialice las actividades
   como RichPresence/CustomStatus/SpotifyRPC y emita las claves
   correctas (application_id, session_id) en snake_case.
   ============================================================ */

async function buildRichPresence(c, a) {
  const type = TYPE_BY_NAME[String(a.type || '').toLowerCase()];
  const rp = new RichPresence(c, {});

  rp.setName(String(a.name || 'PRESENCE').slice(0, 128));
  if (typeof type === 'number') rp.setType(type);

  if (a.details) rp.setDetails(String(a.details).slice(0, 128));
  if (a.state) rp.setState(String(a.state).slice(0, 128));

  /* Se respeta la plataforma elegida por el usuario en cualquier tipo
     (incluido Streaming): nunca se impone desktop por decisión propia.
     Si Discord no pinta el streaming en una plataforma concreta, es
     un límite del cliente, no algo que debamos "corregir" nosotros. */
  const platform = PLATFORM_MAP[String(a.platform || '').toLowerCase()];
  if (platform && VALID_PLATFORMS.has(platform)) rp.setPlatform(platform);

  if (type === ACTIVITY_TYPES.STREAMING) {
    const stream = normalizeUrl(a.streamUrl, false);
    if (stream) {
      try { rp.setURL(stream); } catch (e) { log.warn(`Stream URL inválida: ${e.message}`); }
    }
  }

  const start = toMs(a.startTimestamp) || Date.now();
  const end = toMs(a.endTimestamp);
  rp.setStartTimestamp(start);
  if (end && end > start && end - start < 10 * 24 * 60 * 60 * 1000) {
    rp.setEndTimestamp(end);
  }

  const appId = isValidAppId(a.applicationId) ? String(a.applicationId).trim() : '';

  /* Quirk del cliente de Discord: en Streaming y Competing el
     large_text se pinta como LÍNEA visible bajo el estado en lugar de
     solo al pasar el cursor (hover). Para que el texto sea únicamente
     hover se omite en esos tipos; en el resto (Playing, Watching,
     Listening) Discord sí lo muestra solo al hover. */
  const largeTextHoverOnly =
    type !== ACTIVITY_TYPES.STREAMING && type !== ACTIVITY_TYPES.COMPETING;

  if (a.largeImageUrl) {
    const img = await resolveRichImage(c, a.largeImageUrl, appId);
    if (img) {
      try { rp.setAssetsLargeImage(img); } catch (e) { log.warn(`Imagen grande ignorada: ${e.message}`); }
      if (a.largeImageText && largeTextHoverOnly) {
        rp.setAssetsLargeText(String(a.largeImageText).slice(0, 128));
      } else if (a.largeImageText && !largeTextHoverOnly) {
        log.warn(`Large text omitido en Streaming/Competing para que no se muestre como línea (solo hover).`);
      }
    }
  }
  if (a.smallImageUrl) {
    const img = await resolveRichImage(c, a.smallImageUrl, appId);
    if (img) {
      try { rp.setAssetsSmallImage(img); } catch (e) { log.warn(`Imagen pequeña ignorada: ${e.message}`); }
      if (a.smallImageText) rp.setAssetsSmallText(String(a.smallImageText).slice(0, 128));
    }
  }

  const ps = Number(a.partySize);
  const pm = Number(a.partyMax);
  if (Number.isFinite(ps) && Number.isFinite(pm) && ps >= 1 && pm >= 1 && ps <= pm) {
    try {
      rp.setParty({ id: String(a.partyId || `party-${start}`), current: ps, max: pm });
    } catch (e) { log.warn(`Party ignorado: ${e.message}`); }
  }

  const buttons = [];
  const platformButtonsOk = !platform || BUTTON_PLATFORMS.has(platform);
  if (platformButtonsOk) {
    const b1u = normalizeUrl(a.button1Url, false);
    const b2u = normalizeUrl(a.button2Url, false);
    if (a.button1Text && b1u) buttons.push({ name: String(a.button1Text).slice(0, 32), url: b1u });
    if (a.button2Text && b2u) buttons.push({ name: String(a.button2Text).slice(0, 32), url: b2u });
  } else if (a.button1Text || a.button2Text) {
    log.warn(`Botones omitidos: la plataforma «${a.platform}» no los soporta (solo desktop/web/móvil).`);
  }
  if (buttons.length) {
    try { rp.setButtons(...buttons); } catch (e) { log.warn(`Botones ignorados: ${e.message}`); }
  }

  if (appId) rp.setApplicationId(appId);

  return rp;
}

function buildCustomStatusActivity(c, a) {
  const cs = new CustomStatus(c, {});
  if (a.state) cs.setState(String(a.state).slice(0, 128));
  if (a.emoji) cs.setEmoji(String(a.emoji));
  return cs;
}

function buildActivities(c, activity) {
  const activities = [];

  const type = TYPE_BY_NAME[String(activity.type || '').toLowerCase()];
  if (typeof type === 'number' && activity.enabled !== false) {
    const rp = buildRichPresence(c, activity);
    activities.push(rp);
  }

  return Promise.all(activities);
}

/* El serializador de la librería (ClientPresence.set) produce un paquete
   incompleto para streaming: se come el session_id y deja afk:true en el
   nivel de presencia. Discord descarta esa presencia en silencio (por eso
   connected:true no significaba nada).

   Aquí se reutiliza buildRichPresence() —que ya resuelve platform,
   imágenes, textos, party y botones— y solo se parchea lo que la librería
   serializa mal, en lugar de reconstruir la actividad a mano. */
async function rawActivityPayload(c, activity) {
  const type = TYPE_BY_NAME[String(activity.type || '').toLowerCase()];
  if (typeof type !== 'number') return null;

  /* En Streaming la URL es obligatoria: sin ella Discord no pinta nada,
     así que se descarta la presencia en lugar de enviarla incompleta. */
  if (type === ACTIVITY_TYPES.STREAMING && !normalizeUrl(activity.streamUrl, false)) {
    log.warn('Se omite la presencia: la URL de streaming no es válida.');
    return null;
  }

  const payload = (await buildRichPresence(c, activity)).toJSON();

  /* session_id: sin él Discord ignora la presencia. */
  const sessionId = c.sessionId || (c.ws && c.ws.shards && c.ws.shards.first()?.sessionId);
  if (sessionId) payload.session_id = sessionId;

  if (typeof payload.flags !== 'number') payload.flags = 0;
  if (!payload.timestamps) payload.timestamps = { start: toMs(activity.startTimestamp) || Date.now() };

  return payload;
}

async function broadcastPresence(c, activity) {
  const status = STATUS_MAP[String(activity.status || 'online').toLowerCase()] || 'online';
  const activities = [];

  if (activity.enabled !== false) {
    const raw = await rawActivityPayload(c, activity);
    if (raw) activities.push(raw);
  }

  const packet = {
    activities,
    status,
    afk: false,
    since: 0,
  };

  const shard = c.ws && c.ws.shards && c.ws.shards.first();
  /* shard.send() encola y no devuelve promesa; broadcast() reparte a todos
     los shards, que es lo que necesita una presencia de usuario. */
  if (c.ws && typeof c.ws.broadcast === 'function') c.ws.broadcast({ op: 3, d: packet });
  else if (shard && shard.send) shard.send({ op: 3, d: packet });
  else throw new Error('No hay WebSocket disponible para enviar la presencia');

  /* Se sincroniza el estado local del cliente con lo que realmente se
     envio. Sin esto, client.presence.activities seguiria con la presencia
     anterior (set() ya no se usa) y cualquier lectura posterior
     mostraria informacion obsoleta. */
  try {
    c.presence._patch({
      status,
      afk: false,
      since: 0,
      activities: packet.activities,
    });
  } catch (e) {
    log.warn(`No se pudo sincronizar el estado local de presencia: ${e.message}`);
  }

  return packet;
}

function getRpcState() {
  return { ...rpcState, activity: sanitizeActivity(currentActivity) };
}

/* Los payloads que salen al navegador nunca deben incluir el token.
   El USER_TOKEN solo viaja del cliente → servidor. */
function sanitizeActivity(a) {
  if (!a || typeof a !== 'object') return a;
  const { userToken, ...rest } = a;
  return rest;
}

function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') return s;
  const copy = { ...s };
  delete copy.userToken;
  return copy;
}

/* ============================================================
   Custom Status de perfil (independiente del RPC)
   En esta versión del selfbot el método real es
   client.settings.setCustomStatus() (ClientUserSettingManager),
   NO client.user.setCustomStatus (undefined). El helper intenta
   el primero por compatibilidad y cae al segundo (el que existe).
   La lista de estados puede rotar cada X segundos.
   ============================================================ */

let profileStatuses = [];
let profileSeconds = 60;
let profileTimer = null;
let profileIdx = -1;
let profileBusy = false;
let lineStatus = null;

/* Emoji de Discord en formato <:nombre:id> / <a:nombre:id>.
   normalizeEmoji() convierte el string o el objeto { name, id, animated }
   a un valor que CustomStatus.setEmoji (resolvePartialEmoji) acepta. */
const CUSTOM_EMOJI_RE = /^<(a?):([A-Za-z0-9_]{2,32}):([0-9]{17,20})>$/;

function normalizeEmoji(value) {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const id = String(value.id || '').trim();
    const name = String(value.name || '').trim();
    if (!id && !name) return null;
    return { name: name || undefined, id: id || undefined, animated: !!value.animated };
  }
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(CUSTOM_EMOJI_RE);
  if (m) return { name: m[2], id: m[3], animated: m[1] === 'a' };
  return s;
}

function getProfileRotationState() {
  return {
    active: !!profileTimer,
    seconds: profileSeconds,
    total: profileStatuses.length,
    current: (profileIdx >= 0 && profileStatuses[profileIdx])
      ? { text: profileStatuses[profileIdx].text || '', emoji: profileStatuses[profileIdx].emoji || '' }
      : null,
  };
}

async function setProfileStatus(c0, options) {
  /* Prefiere la API pedida por el usuario; si no existe (versión actual),
     usa la real de ClientUserSettingManager. */
  if (typeof c0.user.setCustomStatus === 'function') {
    return c0.user.setCustomStatus(options);
  }
  if (c0.settings && typeof c0.settings.setCustomStatus === 'function') {
    return c0.settings.setCustomStatus(options);
  }
  throw new Error('Este build del selfbot no expone setCustomStatus.');
}

async function applyProfileStatus(c, status) {
  const c0 = c || client;
  if (!c0 || !c0.settings || !c0.user) {
    return { ok: false, error: 'No hay conexión con Discord para el Custom Status de perfil.' };
  }
  const text = String((status && status.text) || '').trim().slice(0, 128);
  const emoji = normalizeEmoji(status && status.emoji);
  if (!text && !emoji) return { ok: false, error: 'El Custom Status de perfil requiere texto o emoji.' };

  /* Se construye un CustomStatus porque setCustomStatus con objeto plano
     solo resuelve emojis del caché del cliente; la instancia pasa el
     objeto { name, id, animated } directo al payload (incluye emoji_id). */
  const cs = new CustomStatus(c0, {});
  if (text) cs.setState(text);
  if (emoji) cs.setEmoji(emoji);

  try {
    await setProfileStatus(c0, cs);
    const shown = emoji && typeof emoji === 'object'
      ? `<${emoji.animated ? 'a' : ''}:${emoji.name || 'emoji'}:${emoji.id}>`
      : (emoji || '');
    log.ok(`Custom Status de perfil → ${shown ? shown + ' ' : ''}${text || '(solo emoji)'}`);
    io.emit('profileRotationState', getProfileRotationState());
    return { ok: true };
  } catch (err) {
    log.error(`Custom Status de perfil falló: ${err.message}`);
    return { ok: false, error: describeRpcError(err) };
  }
}

function profileRotationTick() {
  if (!profileStatuses.length || profileBusy) return;
  profileBusy = true;
  profileIdx = (profileIdx + 1) % profileStatuses.length;
  applyProfileStatus(client, profileStatuses[profileIdx])
    .then(() => io.emit('profileRotationState', getProfileRotationState()))
    .catch(() => io.emit('profileRotationState', getProfileRotationState()))
    .finally(() => { profileBusy = false; });
}

function startProfileRotation(list, seconds) {
  stopProfileRotation();
  const arr = (Array.isArray(list) ? list : [])
    .map((s) => {
      const t = String((s && s.text) || '').trim().slice(0, 128);
      const e = normalizeEmoji(s && s.emoji);
      if (!t && !e) return null;
      return { text: t, emoji: e || '' };
    })
    .filter(Boolean);
  if (!arr.length) return { ok: false, error: 'Sin estados de perfil para rotar' };

  profileStatuses = arr;
  profileSeconds = Math.max(5, Number(seconds) || 60);
  profileIdx = -1;

  persistSettings({ profileStatuses: arr, profileRotationSeconds: profileSeconds });

  profileRotationTick();
  profileTimer = setInterval(profileRotationTick, profileSeconds * 1000);
  io.emit('profileRotationState', getProfileRotationState());
  return { ok: true, ...getProfileRotationState() };
}

function stopProfileRotation() {
  if (profileTimer) {
    clearInterval(profileTimer);
    profileTimer = null;
  }
  profileStatuses = [];
  profileIdx = -1;
  io.emit('profileRotationState', getProfileRotationState());
  return { ok: true };
}

/* ============================================================
   Conexión con Discord
   ============================================================ */

async function connectRpc(token) {
  const tok = String(token || '').trim();
  if (!tok) {
    rpcState.error = 'Falta el USER_TOKEN (colócalo en el dashboard o en la variable de entorno USER_TOKEN).';
    log.error(rpcState.error);
    return;
  }
  if (connecting) return connecting;

  /* Una conexión nueva cancela reintentos pendientes y marca que el
     usuario no pidió desconexión manual. */
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = 0;
  userDisconnected = false;

  connecting = (async () => {
    if (client) {
      try { client.destroy(); } catch (e) { /* noop */ }
      client = null;
    }

    log.info('Conectando a la pasarela de Discord con USER_TOKEN…');
    rpcState = { connected: false, clientId: null, error: null, updatedAt: rpcState.updatedAt };

    const c = new Client({
      intents: [
        Intents.FLAGS.GUILDS,
      ],
    });
    client = c;

    c.on('ready', async () => {
      rpcState.connected = true;
      rpcState.error = null;
      rpcState.clientId = (c.user && c.user.id) || null;
      reconnectAttempts = 0;
      const tag = (c.user && (c.user.tag || c.user.username || c.user.id)) || 'usuario';
      log.ok(`Conectado a Discord como ${tag} (vía USER_TOKEN)`);

      /* FIX CLAVE del «?»: sin esta línea las actividades se emiten
         con claves camelCase (applicationId, sessionId) y Discord no
         resuelve la aplicación. Con userId === user.id la librería
         serializa RichPresence/CustomStatus/SpotifyRPC (snake_case). */
      try { c.presence.userId = c.user.id; } catch (e) { /* noop */ }

      try {
        if (currentActivity) {
          const packet = await broadcastPresence(c, currentActivity);
          log.rpc('Replicando actividad al reconectar', packet.activities);
        } else if (lineStatus) {
          await applyProfileStatus(c, lineStatus);
        }
      } catch (e) {
        log.error(`Fallo al replicar la actividad: ${e.message}`);
      }

      io.emit('rpcStatus', getRpcState());
    });

    c.on('disconnect', () => {
      rpcState.connected = false;
      log.warn('Desconectado de Discord (sesión cerrada o red perdida).');
      io.emit('rpcStatus', getRpcState());
      scheduleReconnect('sesión cerrada / red perdida');
    });

    c.on('invalidated', () => {
      rpcState.connected = false;
      rpcState.error = 'Sesión invalidada: el token fue revocado o rechazado por Discord.';
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      reconnectAttempts = 0;
      log.error(rpcState.error);
      io.emit('rpcStatus', getRpcState());
    });

    c.on('error', (err) => {
      log.warn(`Evento de error del cliente Discord: ${(err && err.message) || err}`);
    });

    /* Registra el motivo real del cierre del WebSocket (código/razón)
       para poder diagnosticar por qué cae la sesión. */
    try {
      const shard = c.ws && c.ws.shards && c.ws.shards.first();
      if (shard && shard.ws) {
        shard.ws.on('close', (code, reason) => {
          const why = reason ? String(reason).slice(0, 120) : `código ${code}`;
          log.warn(`WebSocket de Discord cerrado: ${why}`);
        });
      }
    } catch (e) { /* noop */ }

    try {
      /* Un token inválido (o una pasarela sin respuesta) puede dejar
         `c.login()` pendiente para siempre en este build del selfbot.
         Para que `connecting` no quede colgado y bloquee futuras
         conexiones, se limita el intento y se limpia el estado. */
      const CONNECT_TIMEOUT = 10000;
      const login = c.login(tok);
      let loginTimer = null;
      const settled = await Promise.race([
        login.then(() => 'ok'),
        new Promise((resolve) => {
          loginTimer = setTimeout(() => resolve('timeout'), CONNECT_TIMEOUT);
        }),
      ]);
      clearTimeout(loginTimer);
      if (settled === 'timeout') {
        login.catch(() => { /* el login real puede rechazar tras el timeout */ });
        try { c.destroy(); } catch (e) { /* noop */ }
        throw new Error(
          `La conexión con Discord tardó más de ${CONNECT_TIMEOUT / 1000}s sin respuesta. ` +
          'El token puede haber sido rechazado/revocado o la pasarela no responde. Reintenta o revisa el USER_TOKEN.'
        );
      }
      connectedToken = tok;
      try { c.presence.userId = c.user.id; } catch (e) { /* noop */ }
      rpcState.clientId = (c.user && c.user.id) || null;
    } catch (err) {
      const msg = describeTokenError(err);
      rpcState.connected = false;
      rpcState.error = msg;
      log.error(msg);
      try { client.destroy(); } catch (e) { /* noop */ }
      client = null;
      connectedToken = null;
      io.emit('rpcStatus', getRpcState());
      throw err;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

async function ensureRpc(token) {
  if (client && connectedToken === token && rpcState.connected) return;
  await connectRpc(token);
}

/* Programa un reintento de conexión con backoff exponencial si no hay
   otro reintento en curso y el usuario no pidió desconexión manual. */
function scheduleReconnect(reason) {
  if (userDisconnected) return;
  if (reconnectTimer) return;
  const settings = loadSettings();
  const token = connectedToken || (settings && settings.userToken) || USER_TOKEN_ENV;
  if (!token) {
    rpcState.error = 'Desconectado sin token disponible para reconectar.';
    log.error(rpcState.error);
    io.emit('rpcStatus', getRpcState());
    return;
  }
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    rpcState.error =
      `No se pudo reconectar tras ${MAX_RECONNECT_ATTEMPTS} intentos (${reason}). ` +
      'Revisa el USER_TOKEN o reconecta manualmente desde el dashboard.';
    log.error(rpcState.error);
    io.emit('rpcStatus', getRpcState());
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_MS);
  log.warn(
    `Reconexión a Discord en ~${Math.round(delay / 1000)}s ` +
    `(intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}): ${reason}`
  );
  rpcState.error = `Reconectando (intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`;
  io.emit('rpcStatus', getRpcState());
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectRpc(token);
    } catch (e) {
      /* connectRpc ya registra el error */
    }
  }, delay);
}

function disconnectRpc() {
  userDisconnected = true;
  stopRotation();
  stopStateRotation();
  stopProfileRotation();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = 0;
  if (client) {
    try { client.destroy(); } catch (e) { /* noop */ }
    client = null;
  }
  connectedToken = null;
  currentActivity = null;
  rpcState = { connected: false, clientId: null, error: null, updatedAt: null };
  log.info('Cliente Discord desconectado manualmente desde el dashboard.');
  io.emit('rpcStatus', getRpcState());
}

/* Auto-conexión al arrancar: deja el RPC activo 24/7 desde el host,
   sin necesidad de tener el dashboard abierto. Si AUTO_CONNECT=0 se
   omite (útil si solo quieres conectar manualmente). */
async function autoConnect() {
  if (String(process.env.AUTO_CONNECT || '1').trim() === '0') {
    log.info('AUTO_CONNECT=0: no se conecta automáticamente a Discord.');
    return;
  }
  const settings = loadSettings();
  /* En el host (bot-hosting), la fuente de verdad del token es la
     variable de entorno USER_TOKEN (secreta y persistente). Se prefiere
     sobre settings.userToken para que un settings.json sembrado con un
     token viejo no deje la auto-conexión en 401. */
  const token = USER_TOKEN_ENV || (settings && settings.userToken);
  if (!token) {
    log.warn('Auto-conexión: sin USER_TOKEN (ponlo en la variable USER_TOKEN o en el dashboard y reinicia).');
    return;
  }
  /* Deja la actividad guardada lista para que el handler 'ready'
     la re-aplique en cuanto conecte. */
  if (!currentActivity) currentActivity = { ...settings };
  const name = (settings && settings.name) || 'estado guardado';
  log.info(`Auto-conexión a Discord con la actividad «${name}»…`);
  try {
    await connectRpc(token);
  } catch (err) {
    log.error(`Auto-conexión fallida: ${err.message}`);
  }
}

async function clearActivity() {
  if (client && client.user) {
    try {
      await client.user.setPresence({ activities: [], status: 'online' });
    } catch (e) {
      throw e;
    }
  }
  currentActivity = null;
  io.emit('presenceUpdated', null);
  return { ok: true };
}

async function updatePresence(activity) {
  /* Sin startTimestamp, Discord cuenta desde el momento de aplicar:
     se guarda ese instante para que la tarjeta lo muestre igual. */
  if (!activity.startTimestamp) activity.startTimestamp = Date.now();
  currentActivity = activity;
  if (stateTimer) baseActivity = { ...activity };
  rpcState.updatedAt = new Date().toISOString();

  const warnings = validateActivity(activity).warnings;
  const token = resolveToken(activity, loadSettings());
  if (!token) {
    rpcState.error = 'Falta el USER_TOKEN (USER_TOKEN en .env o en el campo del dashboard).';
    log.error(`No se aplicó la actividad: ${rpcState.error}`);
    io.emit('presenceUpdated', sanitizeActivity(currentActivity));
    return { ok: false, error: rpcState.error, warnings };
  }

  const { problems } = validateActivity(activity);
  if (problems.length) {
    rpcState.error = problems[0];
    log.error(`Actividad rechazada antes de enviarse: ${problems[0]}`);
    io.emit('presenceUpdated', sanitizeActivity(currentActivity));
    return { ok: false, error: rpcState.error, warnings };
  }

  try {
    await ensureRpc(token);
    const status = STATUS_MAP[String(activity.status || 'online').toLowerCase()] || 'online';

    /* Se envía el paquete crudo: el serializador de la librería produce un
       streaming sin session_id y con afk:true, que Discord descarta. */
    const packet = await broadcastPresence(client, activity);
    const sentActivities = packet.activities;

    await new Promise((r) => setTimeout(r, 400));

    /* El gateway no devuelve ACK, asi que no existe forma de confirmar desde
       el servidor que Discord pinto la tarjeta. Lo que si se puede verificar
       es que el paquete emitido este completo (sobre todo session_id, sin el
       cual Discord descarta la presencia) y que el estado local del cliente
       refleje lo que se envio. */
    const applied = (client.presence.activities || []).map((a) => {
      const j = a.toJSON ? a.toJSON() : a;
      return { name: j.name, type: j.type, url: j.url, application_id: j.application_id, session_id: j.session_id };
    });

    const wanted = activity.enabled !== false ? 1 : 0;
    const emitted = sentActivities.length;
    const wellFormed = emitted === 0 || sentActivities.every((a) => a.name && typeof a.type === 'number' && a.session_id);

    rpcState.appliedActivity = applied;
    rpcState.sentActivity = sentActivities;
    rpcState.verified = emitted === wanted && wellFormed && applied.length === emitted;

    if (emitted > 0 && !wellFormed) {
      rpcState.connected = false;
      rpcState.error = 'El paquete de presencia esta incompleto (falta session_id). Discord no lo mostrara.';
      log.error(rpcState.error);
      io.emit('presenceUpdated', sanitizeActivity(currentActivity));
      return { ok: false, connected: false, error: rpcState.error, warnings };
    }

    rpcState.connected = true;
    rpcState.error = null;
    log.ok(`Presencia aplicada en Discord (${activity.name || 'PRESENCE'})`);
    log.rpc('paquete enviado', sentActivities);
    log.rpc('estado local del cliente', applied);
    io.emit('presenceUpdated', sanitizeActivity(currentActivity));
    return { ok: true, connected: true, verified: rpcState.verified, warnings };
  } catch (err) {
    rpcState.error = describeRpcError(err);
    log.error(`Fallo al aplicar la presencia: ${rpcState.error}`);
    io.emit('presenceUpdated', sanitizeActivity(currentActivity));
    return { ok: false, connected: false, error: rpcState.error, warnings };
  }
}

/* setCustomStatus: inyecta un texto libre al Rich Presence.
   `into` decide si el texto va a Details o a State. */
async function setCustomStatus(data) {
  const settings = loadSettings();
  const title = (data.title || '').trim();
  const artist = (data.artist || '').trim();
  const text = (data.text || '').trim();
  const into = data.into === 'details' ? 'details' : 'state';

  const activity = {
    userToken: String(data.userToken || settings.userToken || ''),
    applicationId: String(data.applicationId || settings.applicationId || ''),
    name: data.name || settings.name || '',
    type: data.type || settings.type || 'playing',
    platform: data.platform || settings.platform || 'desktop',
    status: data.status || settings.status || 'online',
    streamUrl: data.streamUrl || settings.streamUrl || '',
    partyId: data.partyId || settings.partyId || '',
    partySize: data.partySize !== undefined ? data.partySize : settings.partySize,
    partyMax: data.partyMax !== undefined ? data.partyMax : settings.partyMax,
    startTimestamp: data.startTimestamp || settings.startTimestamp || '',
    endTimestamp: data.endTimestamp || settings.endTimestamp || '',
    details: String(data.details || [title, artist].filter(Boolean).join(' — ') || data.theme || 'Presencia personalizada').slice(0, 128),
    state: String(data.state || '').slice(0, 128),
    largeImageUrl: data.largeImageUrl || settings.largeImageUrl,
    largeImageText: data.largeImageText || (title ? `${title} — ${artist}` : 'Presencia personalizada'),
    smallImageUrl: data.smallImageUrl || settings.smallImageUrl,
    smallImageText: data.smallImageText || '',
    button1Text: settings.button1Text,
    button1Url: settings.button1Url,
    button2Text: settings.button2Text,
    button2Url: settings.button2Url,
  };

  if (into === 'details') activity.details = String(text).slice(0, 128);
  else activity.state = String(text).slice(0, 128);

  return updatePresence(cleanActivity(activity));
}

/* ============================================================
   Rotación de perfiles (plantillas RPC)
   ============================================================ */

let rotationTimer = null;
let rotationProfiles = [];
let rotationIndex = -1;
let rotationSeconds = 60;
let rotationBusy = false;

function getRotationState() {
  return {
    active: !!rotationTimer,
    seconds: rotationSeconds,
    total: rotationProfiles.length,
    current: rotationIndex >= 0 && rotationProfiles[rotationIndex]
      ? { name: String(rotationProfiles[rotationIndex].profileName || rotationProfiles[rotationIndex].name || `Perfil ${rotationIndex + 1}`) }
      : null,
  };
}

function rotationTick() {
  if (!rotationProfiles.length || rotationBusy) return;
  rotationBusy = true;
  rotationIndex = (rotationIndex + 1) % rotationProfiles.length;

  const profile = cleanActivity(rotationProfiles[rotationIndex]);
  if (!profile.userToken) profile.userToken = resolveToken(profile, loadSettings());

  /* Si el perfil rotado no define timestamps, se heredan de la actividad
     actual para que el contador («hora de inicio») no se resetee a 00:00
     en cada swap de rotación. */
  if (profile.startTimestamp === undefined) profile.startTimestamp = (currentActivity && currentActivity.startTimestamp) || '';
  if (profile.endTimestamp === undefined) profile.endTimestamp = (currentActivity && currentActivity.endTimestamp) || '';

  updatePresence(profile)
    .then(() => io.emit('rotationState', getRotationState()))
    .catch(() => io.emit('rotationState', getRotationState()))
    .finally(() => { rotationBusy = false; });
}

function startRotation(profiles, seconds) {
  stopStateRotation();
  stopRotation();
  const list = Array.isArray(profiles)
    ? profiles.filter((p) => p && typeof p === 'object' && Object.keys(p).length)
    : [];
  if (!list.length) return { ok: false, error: 'Sin perfiles para rotar' };

  rotationProfiles = list;
  rotationSeconds = Math.max(5, Number(seconds) || 60);
  rotationIndex = -1;
  rotationTick();
  rotationTimer = setInterval(rotationTick, rotationSeconds * 1000);
  io.emit('rotationState', getRotationState());
  return { ok: true, ...getRotationState() };
}

function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
  rotationProfiles = [];
  rotationIndex = -1;
  io.emit('rotationState', getRotationState());
  return { ok: true };
}

/* ============================================================
   Rotación de estados (frases en bucle sobre la actividad base)
   ============================================================ */

let stateTimer = null;
let statePhrases = [];
let stateIndex = -1;
let stateSeconds = 60;
let stateInto = 'state';
let stateBusy = false;
let baseActivity = null;

function getStateRotationState() {
  return {
    active: !!stateTimer,
    seconds: stateSeconds,
    into: stateInto,
    total: statePhrases.length,
    current: stateIndex >= 0 && statePhrases[stateIndex]
      ? { text: String(statePhrases[stateIndex]) }
      : null,
  };
}

function buildBaseActivity() {
  const settings = loadSettings();
  return {
    userToken: String(settings.userToken || ''),
    applicationId: settings.applicationId || '',
    name: settings.name || 'PRESENCE',
    type: settings.type || 'playing',
    platform: settings.platform || 'desktop',
    status: settings.status || 'online',
    streamUrl: settings.streamUrl || '',
    partyId: settings.partyId || '',
    partySize: settings.partySize !== '' && settings.partySize != null ? settings.partySize : undefined,
    partyMax: settings.partyMax !== '' && settings.partyMax != null ? settings.partyMax : undefined,
    startTimestamp: settings.startTimestamp || '',
    endTimestamp: settings.endTimestamp || '',
    details: settings.details || '',
    state: settings.state || '',
    largeImageUrl: settings.largeImageUrl || '',
    largeImageText: settings.largeImageText || '',
    smallImageUrl: settings.smallImageUrl || '',
    smallImageText: settings.smallImageText || '',
    button1Text: settings.button1Text || '',
    button1Url: settings.button1Url || '',
    button2Text: settings.button2Text || '',
    button2Url: settings.button2Url || '',
  };
}

function stateRotationTick() {
  if (!statePhrases.length || stateBusy) return;
  stateBusy = true;
  stateIndex = (stateIndex + 1) % statePhrases.length;

  const base = cleanActivity(baseActivity ? { ...baseActivity } : buildBaseActivity());
  if (!base.userToken) base.userToken = resolveToken(base, loadSettings());
  if (stateInto === 'details') base.details = String(statePhrases[stateIndex]).slice(0, 128);
  else base.state = String(statePhrases[stateIndex]).slice(0, 128);

  updatePresence(base)
    .then(() => io.emit('stateRotationState', getStateRotationState()))
    .catch(() => io.emit('stateRotationState', getStateRotationState()))
    .finally(() => { stateBusy = false; });
}

function startStateRotation(data) {
  stopStateRotation();
  stopRotation();

  const phrases = (Array.isArray(data && data.phrases) ? data.phrases : [])
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (!phrases.length) return { ok: false, error: 'Sin frases para rotar' };

  const fromForm = data && typeof data.base === 'object' && data.base ? cleanActivity(data.base) : null;
  baseActivity = currentActivity ? { ...currentActivity } : (fromForm || buildBaseActivity());
  if (!baseActivity.userToken) baseActivity.userToken = resolveToken(baseActivity, loadSettings());

  statePhrases = phrases;
  stateSeconds = Math.max(5, Number(data && data.seconds) || 60);
  stateInto = data && data.into === 'details' ? 'details' : 'state';
  stateIndex = -1;

  stateRotationTick();
  stateTimer = setInterval(stateRotationTick, stateSeconds * 1000);
  io.emit('stateRotationState', getStateRotationState());
  return { ok: true, ...getStateRotationState() };
}

function stopStateRotation() {
  if (stateTimer) {
    clearInterval(stateTimer);
    stateTimer = null;
  }
  statePhrases = [];
  stateIndex = -1;
  baseActivity = null;
  io.emit('stateRotationState', getStateRotationState());
  return { ok: true };
}

/* ============================================================
   Reset total del contenedor
   Vuelve el panel al estado de un despliegue nuevo: desconecta
   el RPC, para todas las rotaciones, borra el custom status,
   resetea data/settings.json a valores vacíos y limpia las
   imágenes subidas (public/uploads). Así un bot-hosting que
   conservara datos previos queda limpio desde la misma web.
   ============================================================ */

function clearUploads() {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) return true;
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      const p = path.join(UPLOAD_DIR, f);
      try { fs.unlinkSync(p); } catch (e) { /* noop */ }
    }
    return true;
  } catch (err) {
    console.error('[RESET] no se pudieron limpiar uploads:', err.message);
    return false;
  }
}

function resetAll() {
  stopRotation();
  stopStateRotation();
  stopProfileRotation();
  lineStatus = null;
  disconnectRpc();
  saveSettings({ ...DEFAULT_SETTINGS });
  clearUploads();

  const fresh = {
    settings: sanitizeSettings(loadSettings()),
    rpc: getRpcState(),
    rotation: getRotationState(),
    stateRotation: getStateRotationState(),
    profileRotation: getProfileRotationState(),
  };
  io.emit('init', fresh);
  io.emit('rpcStatus', getRpcState());
  io.emit('presenceUpdated', null);
  log.ok('Reset total: settings, uploads y RPC limpios (estado de despliegue nuevo).');
  return fresh;
}

/* ============================================================
   REST (compatibilidad + pruebas)
   ============================================================ */

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    connected: rpcState.connected,
    rpc: {
      active: rpcState.connected,
      activity: currentActivity ? currentActivity.name || currentActivity.details || 'activo' : null,
    },
    ts: new Date().toISOString(),
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    settings: sanitizeSettings(loadSettings()),
    rpc: getRpcState(),
    rotation: getRotationState(),
    stateRotation: getStateRotationState(),
    profileRotation: getProfileRotationState(),
  });
});

app.post('/api/update', async (req, res) => {
  try {
    const activity = cleanActivity(req.body || {});
    persistSettings(activity);
    const result = await updatePresence(activity);
    res.json({ ...result, state: getRpcState() });
  } catch (err) {
    log.error(`POST /api/update: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message, state: getRpcState() });
  }
});

app.post('/api/reset', (req, res) => {
  try {
    const fresh = resetAll();
    res.json({ ok: true, ...fresh });
  } catch (err) {
    log.error(`POST /api/reset: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/set-custom-status', async (req, res) => {
  try {
    const result = await setCustomStatus(req.body || {});
    res.json({ ...result, state: getRpcState() });
  } catch (err) {
    log.error(`POST /api/set-custom-status: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message, state: getRpcState() });
  }
});

app.post('/api/profile-status', async (req, res) => {
  try {
    const result = await applyProfileStatus(client, req.body || {});
    res.json({ ...result, state: getProfileRotationState() });
  } catch (err) {
    log.error(`POST /api/profile-status: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/profile-statuses', (req, res) => {
  try {
    const result = startProfileRotation(
      (req.body && req.body.statuses),
      (req.body && req.body.seconds),
    );
    res.json(result);
  } catch (err) {
    log.error(`POST /api/profile-statuses: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/connect', async (req, res) => {
  try {
    const token = (req.body && req.body.userToken) || loadSettings().userToken || USER_TOKEN_ENV;
    await connectRpc(token);
    res.json({ ok: true, state: getRpcState() });
  } catch (err) {
    log.error(`POST /api/connect: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message, state: getRpcState() });
  }
});

app.post('/api/upload-image', (req, res) => {
  try {
    uploadImage.single('image')(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? 'La imagen supera el límite de 25 MB.'
          : err.message;
        log.error(`POST /api/upload-image: ${msg}`);
        return res.status(400).json({ ok: false, error: msg });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo (campo «image»).' });
      }
      const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
      log.ok(`Imagen subida: ${url}`);
      res.json({ ok: true, url, file: req.file.filename });
    });
  } catch (err) {
    log.error(`POST /api/upload-image: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/state-rotation', (req, res) => {
  try {
    const result = startStateRotation(req.body || {});
    res.json(result);
  } catch (err) {
    log.error(`POST /api/state-rotation: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ============================================================
   Socket.io — eventos en tiempo real (todos con try/catch)
   ============================================================ */

io.on('connection', (socket) => {
  console.log(`[SOCKET] Cliente conectado (${socket.id})`);
  socket.emit('init', {
    settings: sanitizeSettings(loadSettings()),
    rpc: getRpcState(),
    rotation: getRotationState(),
    stateRotation: getStateRotationState(),
    profileRotation: getProfileRotationState(),
  });
  socket.emit('rotationState', getRotationState());
  socket.emit('stateRotationState', getStateRotationState());
  socket.emit('profileRotationState', getProfileRotationState());

  socket.on('updatePresence', async (data, ack) => {
    try {
      const activity = cleanActivity(data || {});
      persistSettings(activity);
      const result = await updatePresence(activity);
      if (typeof ack === 'function') ack({ ...result, state: getRpcState() });
    } catch (err) {
      log.error(`Socket updatePresence: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message, state: getRpcState() });
    }
  });

  socket.on('setCustomStatus', async (data, ack) => {
    try {
      const result = await setCustomStatus(data || {});
      if (typeof ack === 'function') ack({ ...result, state: getRpcState() });
    } catch (err) {
      log.error(`Socket setCustomStatus: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message, state: getRpcState() });
    }
  });

  socket.on('applyProfileStatus', async (data, ack) => {
    try {
      const result = await applyProfileStatus(client, data || {});
      if (typeof ack === 'function') ack(result);
    } catch (err) {
      log.error(`Socket applyProfileStatus: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('saveProfileStatuses', (data, ack) => {
    try {
      const res = startProfileRotation(
        (data && data.statuses),
        (data && data.seconds),
      );
      if (typeof ack === 'function') ack(res);
    } catch (err) {
      log.error(`Socket saveProfileStatuses: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('stopProfileRotation', (ack) => {
    try {
      const res = stopProfileRotation();
      if (typeof ack === 'function') ack(res);
    } catch (err) {
      log.error(`Socket stopProfileRotation: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('saveRotation', (data, ack) => {
    try {
      const res = startRotation(data && data.profiles, data && data.seconds);
      if (typeof ack === 'function') ack(res);
    } catch (err) {
      log.error(`Socket saveRotation: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('stopRotation', (ack) => {
    try {
      const res = stopRotation();
      if (typeof ack === 'function') ack(res);
    } catch (err) {
      log.error(`Socket stopRotation: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('saveStateRotation', (data, ack) => {
    try {
      const res = startStateRotation(data || {});
      if (typeof ack === 'function') ack(res);
    } catch (err) {
      log.error(`Socket saveStateRotation: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('stopStateRotation', (ack) => {
    try {
      const res = stopStateRotation();
      if (typeof ack === 'function') ack(res);
    } catch (err) {
      log.error(`Socket stopStateRotation: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('clearActivity', async (ack) => {
    try {
      const res = await clearActivity();
      if (typeof ack === 'function') ack(res);
    } catch (err) {
      log.error(`Socket clearActivity: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('connectRpc', async (data, ack) => {
    try {
      const token = (data && data.userToken) || loadSettings().userToken || USER_TOKEN_ENV;
      await connectRpc(token);
      if (typeof ack === 'function') ack({ ok: true, state: getRpcState() });
    } catch (err) {
      log.error(`Socket connectRpc: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message, state: getRpcState() });
    }
  });

  socket.on('disconnectRpc', () => {
    try {
      disconnectRpc();
    } catch (err) {
      log.error(`Socket disconnectRpc: ${err.message}`);
    }
  });

  socket.on('resetAll', (ack) => {
    try {
      const fresh = resetAll();
      if (typeof ack === 'function') ack({ ok: true, ...fresh });
    } catch (err) {
      log.error(`Socket resetAll: ${err.message}`);
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });
});

/* ============================================================
   Arranque
   ============================================================ */

/* Garantía de privacidad: si no hay ningún token (ni USER_TOKEN en
   env ni userToken en data/settings.json), no puede existir un RPC
   configurado por nadie. En ese caso se restaura todo a estado de
   fábrica (DEFAULT_SETTINGS + uploads vacíos) para que un contenedor
   nuevo o un bot-hosting con datos previos arranque 100% limpio y
   listo para que el usuario lo configure desde cero. */
function ensureCleanState() {
  const s = loadSettings();
  const hasToken = Boolean(USER_TOKEN_ENV) || Boolean(String(s.userToken || '').trim());
  if (hasToken) return;
  saveSettings({ ...DEFAULT_SETTINGS });
  clearUploads();
  currentActivity = null;
  log.ok('Arranque limpio: sin USER_TOKEN, panel restaurado a estado de fábrica.');
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ┌────────────────────────────────────────────────┐');
  console.log('  │  PRESENCE·OS — Rich Presence Dashboard        │');
  console.log('  └────────────────────────────────────────────────┘');
  console.log(`  Dashboard  →  http://localhost:${PORT}`);
  console.log(`  Socket.io  →  http://localhost:${PORT}/socket.io`);
  console.log(`  API        →  /api/status · /api/update · /health`);
  console.log('  Logs RPC   →  conexión, errores y payloads en consola');
  console.log('');
  console.log('  Cloud-ready: PORT del entorno, proxy inverso (trust proxy)');
  console.log('  Nota: Rich Presence vía USER_TOKEN (cuenta propia).');
  console.log(`  USER_TOKEN desde env: ${USER_TOKEN_ENV ? 'definido' : 'vacío — usa el campo del dashboard o variables de entorno'}`);
  console.log('  Auto-conexión → RPC activo 24/7 desde el host');
  ensureCleanState();
  autoConnect();
});

process.on('SIGINT', () => {
  console.log('\nCerrando servidor…');
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopRotation();
  stopStateRotation();
  stopProfileRotation();
  for (const t of [profileTimer, stateTimer, rotationTimer]) {
    if (t) clearInterval(t);
  }
  try { if (client) client.destroy(); } catch (e) { /* noop */ }
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
