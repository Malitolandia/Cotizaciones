const crypto = require('crypto');
const { getRows, appendRows, ensureReady } = require('./_lib/sheets');
const { notifyNewBid } = require('./_lib/notify');

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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
    return;
  }

  res.status(201).json({ ok: true });

  // Notificación por correo (después de responder; si falla, no afecta al proveedor)
  try {
    const [suppliers, quotes] = await Promise.all([getRows('Suppliers'), getRows('Quotes')]);
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (supplier) {
      const quote = quotes.find((q) => q.uuid === supplier.quote_uuid);
      await notifyNewBid({
        quoteTitle: quote ? quote.title : '',
        quoteUuid: supplier.quote_uuid,
        company: supplier.company,
        phone: supplier.phone,
      });
    }
  } catch (notifyErr) {
    console.error('Error enviando notificación:', notifyErr);
  }
};
