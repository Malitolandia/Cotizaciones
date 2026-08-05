const { isAuthenticated } = require('./_lib/auth');

module.exports = async (req, res) => {
  try {
    const authenticated = isAuthenticated(req);
    res.status(200).json({ authenticated });
  } catch (err) {
    console.error('Error en session:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};