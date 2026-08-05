const { requireAuth } = require('./_lib/auth');
const { getRows, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (!requireAuth(req, res)) return;

  try {
    await ensureReady();
    const parts = await getRows('Parts');

    const seen = new Map(); // name (normalizado) -> { name, code, unit }
    for (const p of parts) {
      const name = (p.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { name, code: p.code || '', unit: p.unit || '' });
      }
    }

    const catalog = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json({ catalog });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
