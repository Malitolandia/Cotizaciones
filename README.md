# Cotizador de Repuestos — HTML/CSS/JS + Vercel Functions + Google Sheets

Frontend 100% estático (HTML, CSS y JavaScript puro, sin frameworks ni build
step) + backend con **Vercel Serverless Functions** (Node.js) en `/api`, que
hablan con Google Sheets vía una Service Account. No hay base de datos.

## Estructura

```
public/                    Todo lo que ve el navegador (estático)
  index.html                Landing
  admin-login.html           Login del admin
  admin.html                 Panel: crear cotización + listado
  cotizar.html                Página pública del proveedor (?uuid=...)
  results.html                Comparativo de precios (?uuid=...)
  css/styles.css
  js/login.js, admin.js, cotizar.js, results.js

api/                        Backend (cada archivo = 1 función serverless)
  _lib/sheets.js              Auth + CRUD genérico sobre Google Sheets
  _lib/auth.js                Cookie de sesión admin (sha256 de ADMIN_PASSWORD)
  login.js / logout.js / session.js
  quotes.js                   GET listar (admin) / POST crear (admin)
  quote.js                    GET cotización + repuestos (público, ?uuid=)
  quote-status.js             POST cerrar/reabrir (admin)
  suppliers.js                POST registrar proveedor (público, valida teléfono duplicado)
  bids.js                     POST enviar precios (público)
  results.js                  GET comparativo completo (admin, ?uuid=)
```

## 1. Preparar Google Sheets (igual que siempre)

1. Google Cloud Console → crea/usa un proyecto → habilita **Google Sheets API**.
2. **Credenciales → Crear credenciales → Cuenta de servicio** → créala →
   pestaña **Claves → Agregar clave → JSON** → descarga el archivo.
3. Del JSON copia `client_email` y `private_key`.
4. Crea un Google Sheet (puede quedar vacío; las 4 pestañas y encabezados se
   crean solas la primera vez que la app llama a la API).
5. **Compartir** el Sheet con el `client_email` de la Service Account, rol
   **Editor**.
6. Copia el ID del Sheet desde la URL:
   `https://docs.google.com/spreadsheets/d/EL_ID_VA_AQUI/edit`

## 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Completa `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`,
`SPREADSHEET_ID` y `ADMIN_PASSWORD`.

## 3. Probar en local con Vercel CLI

Como el backend son funciones serverless de Vercel (no un servidor Express),
la forma correcta de probarlo en local —con el mismo comportamiento que en
producción— es con `vercel dev`:

```bash
npm install -g vercel      # si no lo tienes instalado
npm install                 # instala googleapis
vercel dev                  # levanta todo en http://localhost:3000
```

La primera vez te pedirá loguearte con tu cuenta de Vercel y "linkear" la
carpeta a un proyecto (puedes crear uno nuevo, ej. `cotizador-repuestos`).
`vercel dev` lee automáticamente las variables de `.env.local`.

Abre `http://localhost:3000/admin.html`, entra con `ADMIN_PASSWORD`, crea una
cotización y copia el enlace `/cotizar.html?uuid=...` para probarlo como
proveedor (puedes abrirlo en una ventana de incógnito).

> Si prefieres no instalar Vercel CLI globalmente: `npx vercel dev`.

## 4. Desplegar a Vercel

```bash
vercel          # despliegue de prueba (preview)
vercel --prod    # despliegue a producción
```

O conecta el repo de GitHub desde el dashboard de Vercel (Import Project).
En cualquiera de los dos casos, agrega las 4 variables de entorno en
**Project Settings → Environment Variables** (pega `GOOGLE_SHEETS_PRIVATE_KEY`
tal cual, con los `\n` literales — Vercel los interpreta bien).

No hace falta configurar nada más: Vercel detecta automáticamente que
`public/` es el contenido estático y que cada archivo en `api/` es un
endpoint (`api/quotes.js` → `/api/quotes`, etc.).

## Notas de diseño

- **Sesión admin**: cookie `HttpOnly` con `sha256(ADMIN_PASSWORD)`. Cada
  función protegida (`quotes.js` GET/POST, `quote-status.js`, `results.js`)
  llama a `requireAuth()`; las páginas `admin.html` y `results.html`
  consultan `/api/session` al cargar y redirigen a `admin-login.html` si no
  hay sesión.
- **Anti-duplicados**: `suppliers.js` normaliza el teléfono (solo dígitos) y
  busca coincidencias dentro de la misma `quote_uuid` antes de guardar.
- **IDs**: `crypto.randomUUID()` generado siempre en el servidor (dentro de
  cada función de `/api`), nunca en el navegador.
- **Sin build step**: no hay bundler, ni TypeScript, ni React — todo es
  JS plano servido tal cual, más fácil de depurar y de modificar a mano.
