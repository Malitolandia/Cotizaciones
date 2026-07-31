const crypto = require('crypto');
const { appendRows, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { supplierId, bids } = req.body || {};
  if (!supplierId || !Array.isArray(bids)) {
    res.status(400).json({ error: 'Parámetros inválidos' });
    return;
  }

  const cleanBids = bids
    .map((b) => ({
      id: crypto.randomUUID(),
      supplier_id: supplierId,
      part_id: b.partId,
      price: String(b.price ?? '').trim(),
      notes: (b.notes || '').trim(),
    }))
    .filter((b) => b.part_id && b.price.length > 0 && !Number.isNaN(Number(b.price)));

  if (cleanBids.length === 0) {
    res.status(400).json({ error: 'Ingresa al menos un precio válido' });
    return;
  }

  try {
    await ensureReady();
    await appendRows('Bids', cleanBids);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
