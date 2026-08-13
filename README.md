# rpc-dash

Dashboard web para Rich Presence de Discord con `USER_TOKEN` (selfbot) — Express + Socket.io + `discord.js-selfbot-v13`.

## Funciones
- Rich Presence personalizada (nombre, tipo, detalles, estado, timestamps, party, botones, imágenes)
- Custom Status de perfil con emojis de Discord (`<:nombre:id>` / `<a:nombre:id>`) y rotación de estados
- Plantillas RPC guardadas en el navegador y rotación automática
- Rotación de frases en Details/State sobre tu actividad base
- Subida de imágenes locales (jpg, jpeg, png, gif, webp, avif — máx. 25 MB) o pegado con `Ctrl+V`
- Cloud-ready: usa `process.env.PORT` y confía en proxies inversos

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

## Despliegue en bot-hosting (import por GitHub)

El token **nunca** está en el repositorio: `.env` y `data/settings.json` están en `.gitignore`, así que al importar el repo por GitHub bot-hosting recibe solo el código. El token se le pasa como variable de entorno **secreta** (solo la ve el dueño del panel):

1. bot-hosting → **New Deployment** → **Application** → Source: **GitHub** → repo `Artjimx/rpc-dash`.
2. **Runtime**: Node.js 20+. **Entry File**: `index.js`.
3. Env Variables: añade `USER_TOKEN` = `<tu token>` (marcado como secreto).
4. **Start**: instala dependencias desde `package.json` y abre la URL pública que te dé el panel.

Nota: bot-hosting clona repos **públicos**. Si vuelves a poner el repo privado, el import/actualización por GitHub dejará de funcionar.

> ⚠️ El uso de tokens de usuario para RPC infringe los Términos de Servicio de Discord; úsalo bajo tu propia responsabilidad y con una cuenta secundaria. El token nunca se guarda en el repositorio (`data/settings.json` y `.env` están en `.gitignore`).
