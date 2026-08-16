# rpc-dash

Dashboard web para Rich Presence de Discord con `USER_TOKEN` (selfbot) — Express + Socket.io + `discord.js-selfbot-v13`.

## Funciones
- Rich Presence personalizada (nombre, tipo, detalles, estado, timestamps, party, botones, imágenes)
- Custom Status de perfil con emojis de Discord (`<:nombre:id>` / `<a:nombre:id>`) y rotación de estados
- Plantillas RPC guardadas en el navegador y rotación automática
- Rotación de frases en Details/State sobre tu actividad base
- Subida de imágenes locales (jpg, jpeg, png, gif, webp, avif — máx. 25 MB) o pegado con `Ctrl+V`
- Cloud-ready: usa `process.env.PORT` y confía en proxies inversos

## Selfbot de comandos (módulo `main.js`)
El RPC y un selfbot de comandos comparten la **misma cuenta y conexión**. El sistema de comandos se engancha al cliente de Discord ya existente y **no afecta al RPC ni a la dashboard**.

Estructura:
```
index.js                 → entrada (RPC dashboard + arranca main.js)
main.js                  → core del selfbot de comandos (bootCommandSystem)
config/                  → configManager.js + config.json (prefijo, ownerId, color…)
commands/                → help, info, autoresponder, utility, automation, panel, aiMedia
utils/                   → commandHandler, logger, permissions, helpers, statusManager, autoresponder, afk
plugins/                 → pluginManager.js + ejemplo (extender sin tocar el core)
providers/ + ai/         → integraciones reales (DuckDuckGo, lyrics.ovh, Pexels, YouTube, Whisper, OpenAI)
data/                    → autoresponder.json, afk.json, status_persist.json (runtime, gitignored)
```

### Comandos
| Comando | Descripción |
| --- | --- |
| `.help [cmd]` | Lista de comandos agrupada por categoría (solo texto) |
| `.userinfo [@u]` · `.serverinfo` · `.avatar [@u]` · `.banner [@u]` | Información de usuarios/servidor |
| `.customembed --title "…" --description "…" --color "#fff" --image <url> --thumbnail <url> --footer "…" --author "…" --timestamp --field "N|V|inline"` | Embed personalizado con botón 🗑 de auto-borrado |
| `.snipe` | Último mensaje eliminado en el canal |
| `.afk [motivo]` | AFK con motivo (se quita al escribir) |
| `.calc <expresión>` | Evaluador aritmético seguro (sin `eval`) |
| `.translate <idioma> <texto>` | Traducción (Google Translate público) |
| `.config` | Ver/editar configuración (prefijo, owner, status) |
| `.panel` | URL del dashboard |
| `.search <q>` · `.lyrics <artista> - <título>` | DuckDuckGo y lyrics.ovh (sin clave) |
| `.images <q>` · `.song <q>` · `.transcribe` · `.ai <pregunta>` | Requieren `PEXELS_API_KEY`, `YOUTUBE_API_KEY`, `OPENAI_API_KEY` (env) |

### Autoresponder (solo por mención)
- Contextos **independientes**: DM y servidor.
- Sin keywords: responde **solo cuando te mencionan** (a tu usuario). Los mensajes propios no disparan el autoresponder.
- `dm add "hola 😎 estoy aquí"`, `server add "https://ejemplo.com te respondo"`…
- `list`, `remove <n>`, `select <n>` (respuesta activa), `rotate on/off` (rotación), `on/off`.
- Persistencia en `data/autoresponder.json`.

### Proveedores (claves opcionales en Variables de entorno)
| Variable | Servicio |
| --- | --- |
| `PEXELS_API_KEY` | `.images` (https://www.pexels.com/api/) |
| `YOUTUBE_API_KEY` | `.song` (YouTube Data API v3) |
| `OPENAI_API_KEY` | `.transcribe` (Whisper) y `.ai` (chat) |
| `PUTER_API_KEY` | Proveedor opcional (`.ai` usa OpenAI por defecto; Puter requiere verificar `PUTER_API_BASE`) |

## Puesta en marcha
```bash
npm install
npm start
```
Abre `http://localhost:3000` y pega tu `USER_TOKEN` en el dashboard.

### Variables de entorno
| Variable | Descripción |
| --- | --- |
| `SERVER_PORT` | Puerto del servidor (prioridad; bot-hosting lo asigna aquí). Respaldo: `PORT` y luego `3000` |
| `USER_TOKEN` | Token de tu cuenta de Discord (alternativa al campo del dashboard) |
| `SEED_SETTINGS_JSON` | JSON con los ajustes iniciales (p. ej. todo el contenido de `data/settings.json`) que se aplica si no existe el archivo en el host. Secreto en el panel |
| `AUTO_CONNECT` | `1` (por defecto) conecta a Discord al arrancar y deja el RPC activo 24/7 desde el host sin abrir el dashboard. `0` para conectar solo manualmente |

## Despliegue en bot-hosting (import por GitHub)

El token **nunca** está en el repositorio: `.env` y `data/settings.json` están en `.gitignore`, así que al importar el repo por GitHub bot-hosting recibe solo el código. El token se le pasa como variable de entorno **secreta** (solo la ve el dueño del panel):

1. bot-hosting → **New Deployment** → **Application** → Source: **GitHub** → repo `Artjimx/rpc-dash`.
2. **Runtime**: Node.js 20+. **Entry File**: `index.js`.
3. Env Variables: añade `USER_TOKEN` = `<tu token>` (marcado como secreto).
4. **Start**: instala dependencias desde `package.json` y abre la URL pública que te dé el panel.

Nota: bot-hosting clona repos **públicos**. Si vuelves a poner el repo privado, el import/actualización por GitHub dejará de funcionar.

> ⚠️ El uso de tokens de usuario para RPC infringe los Términos de Servicio de Discord; úsalo bajo tu propia responsabilidad y con una cuenta secundaria. El token nunca se guarda en el repositorio (`data/settings.json` y `.env` están en `.gitignore`).
