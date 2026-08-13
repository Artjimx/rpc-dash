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
| `PORT` | Puerto del servidor (bot-hosting lo define automáticamente) |
| `USER_TOKEN` | Token de tu cuenta de Discord (alternativa al campo del dashboard) |

> ⚠️ El uso de tokens de usuario para RPC infringe los Términos de Servicio de Discord; úsalo bajo tu propia responsabilidad y con una cuenta secundaria. El token nunca se guarda en el repositorio (`data/settings.json` está en `.gitignore`).
