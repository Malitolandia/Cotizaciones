const { requireAuth } = require('./_lib/auth');
const { getRows, updateRow, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (!requireAuth(req, res)) return;

  const { uuid, status } = req.body || {};
  if (!uuid || !['ACTIVE', 'CLOSED'].includes(status)) {
    res.status(400).json({ error: 'Parámetros inválidos' });
    return;
  }

  try {
    await ensureReady();
    const quotes = await getRows('Quotes');
    const target = quotes.find((q) => q.uuid === uuid);
    if (!target) {
      res.status(404).json({ error: 'Cotización no encontrada' });
      return;
    }
    const { _row, ...rest } = target;
    await updateRow('Quotes', _row, { ...rest, status });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
