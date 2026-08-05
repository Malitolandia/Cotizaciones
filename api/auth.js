const { setSessionCookie, clearSessionCookie, isAuthenticated } = require('./_lib/auth');

module.exports = async (req, res) => {
  // GET /api/session
  if (req.method === 'GET' && req.url === '/api/session') {
    res.status(200).json({ authenticated: isAuthenticated(req) });
    return;
  }

  // POST /api/login
  if (req.method === 'POST' && req.url === '/api/login') {
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
  if (req.method === 'POST' && req.url === '/api/logout') {
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(404).json({ error: 'Not found' });
};