// api/[...path].js
// Versión simplificada con logs para depurar

const crypto = require('crypto');
const { requireAuth, setSessionCookie, clearSessionCookie, isAuthenticated } = require('./_lib/auth');
const { getRows, appendRow, appendRows, updateRow, deleteRow, ensureReady } = require('./_lib/sheets');
const { notifyNewBid } = require('./_lib/notify');

// ============================================================
// Utilidades
// ============================================================
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function getQuery(url) {
  const q = url.indexOf('?');
  if (q === -1) return {};
  const params = new URLSearchParams(url.slice(q + 1));
  const obj = {};
  for (const [key, val] of params) obj[key] = val;
  return obj;
}

// ============================================================
// Manejador principal
// ============================================================
module.exports = async (req, res) => {
  console.log('📥 Request recibida:', req.method, req.url);

  // Parsear body SOLO para POST
  let body = {};
  if (req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks).toString();
      body = data ? JSON.parse(data) : {};
      console.log('📦 Body parseado:', body);
    } catch (err) {
      console.error('❌ Error al parsear body:', err);
      res.status(400).json({ error: 'Body inválido' });
      return;
    }
  }

  try {
    await ensureReady();
    const url = req.url.split('?')[0]; // Solo la ruta, sin query params
    const query = getQuery(req.url);
    const method = req.method;

    console.log(`📍 Ruta: ${url}, Método: ${method}`);

    // ============================================================
    // RUTAS PÚBLICAS (sin autenticación)
    // ============================================================

    // POST /api/login
    if (url === '/api/login' && method === 'POST') {
      console.log('🔑 Intento de login');
      const { password } = body;
      const expected = process.env.ADMIN_PASSWORD || '';
      console.log('Contraseña esperada (oculta)');
      if (!password || password !== expected) {
        console.log('❌ Contraseña incorrecta');
        res.status(401).json({ error: 'Contraseña incorrecta' });
        return;
      }
      console.log('✅ Login exitoso');
      setSessionCookie(res);
      res.status(200).json({ ok: true });
      return;
    }

    // POST /api/logout
    if (url === '/api/logout' && method === 'POST') {
      console.log('🚪 Logout');
      clearSessionCookie(res);
      res.status(200).json({ ok: true });
      return;
    }

    // GET /api/session
    if (url === '/api/session' && method === 'GET') {
      const authenticated = isAuthenticated(req);
      console.log('🔐 Sesión verificada:', authenticated);
      res.status(200).json({ authenticated });
      return;
    }

    // ============================================================
    // Si llegamos aquí, la ruta no existe
    // ============================================================
    console.log('❌ Ruta no encontrada:', url);
    res.status(404).json({ error: 'Not found' });

  } catch (err) {
    console.error('💥 Error en API:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};