const { requireAuth } = require('./_lib/auth');
const { getRows, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (!requireAuth(req, res)) return;

  const uuid = req.query.uuid;
  if (!uuid) {
    res.status(400).json({ error: 'Falta el parámetro uuid' });
    return;
  }

  try {
    await ensureReady();
    const [quotes, allParts, allSuppliers, allBids, allWinners] = await Promise.all([
      getRows('Quotes'),
      getRows('Parts'),
      getRows('Suppliers'),
      getRows('Bids'),
      getRows('Winners'),
    ]);

    const quote = quotes.find((q) => q.uuid === uuid);
    if (!quote) {
      res.status(404).json({ error: 'Cotización no encontrada' });
      return;
    }

    const parts = allParts
      .filter((p) => p.quote_uuid === uuid)
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        unit: p.unit,
        description: p.description,
        quantity: Number(p.quantity) > 0 ? Number(p.quantity) : 1,
      }));

    const suppliers = allSuppliers
      .filter((s) => s.quote_uuid === uuid)
      .map((s) => ({ id: s.id, company: s.company, phone: s.phone, email: s.email }));

    const supplierIds = new Set(suppliers.map((s) => s.id));
    const bids = allBids
      .filter((b) => supplierIds.has(b.supplier_id))
      .map((b) => ({ supplierId: b.supplier_id, partId: b.part_id, price: Number(b.price), notes: b.notes }))
      .filter((b) => !Number.isNaN(b.price));

    const winners = allWinners
      .filter((w) => w.quote_uuid === uuid)
      .map((w) => ({ partId: w.part_id, supplierId: w.supplier_id }));

    res.status(200).json({
      title: quote.title,
      status: quote.status,
      parts,
      suppliers,
      bids,
      winners,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
