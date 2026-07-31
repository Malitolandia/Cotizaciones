const { setSessionCookie } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD || '';

  if (!password || password !== expected) {
    res.status(401).json({ error: 'Contraseña incorrecta' });
    return;
  }

  setSessionCookie(res);
  res.status(200).json({ ok: true });
};
