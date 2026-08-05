const { setSessionCookie, clearSessionCookie, isAuthenticated } = require('./_lib/auth');

module.exports = async (req, res) => {
  const url = req.url;
  const method = req.method;

  // POST /api/login
  if (method === 'POST' && url === '/api/login') {
    const { password } = req.body || {};
    const expected = process.env.ADMIN_PASSWORD || '';
    if (!password || password !== expected) {
      res.status(401).json({ error: 'Contraseña incorrecta' });
      return;
    }
    setSessionCookie(res);
    res.status(200).json({ ok: true });
    return;
  }

  // POST /api/logout
  if (method === 'POST' && url === '/api/logout') {
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
    return;
  }

  // GET /api/session
  if (method === 'GET' && url === '/api/session') {
    res.status(200).json({ authenticated: isAuthenticated(req) });
    return;
  }

  // Si no coincide ninguna ruta
  res.status(404).json({ error: 'Not found' });
};