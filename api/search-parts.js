const { requireAuth } = require('./_lib/auth');
const { getRows, ensureReady } = require('./_lib/sheets');

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .trim();
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (!requireAuth(req, res)) return;

  const q = normalize(req.query.q || '');
  if (q.length < 2) {
    res.status(200).json({ results: [], lowest: null });
    return;
  }

  try {
    await ensureReady();
    const [quotes, parts, suppliers, bids] = await Promise.all([
      getRows('Quotes'),
      getRows('Parts'),
      getRows('Suppliers'),
      getRows('Bids'),
    ]);

    const quotesByUuid = new Map(quotes.map((qt) => [qt.uuid, qt]));
    const suppliersById = new Map(suppliers.map((s) => [s.id, s]));

    const bidsByPartId = new Map();
    bids.forEach((b) => {
      const price = Number(b.price);
      if (Number.isNaN(price)) return;
      if (!bidsByPartId.has(b.part_id)) bidsByPartId.set(b.part_id, []);
      bidsByPartId.get(b.part_id).push({ ...b, price });
    });

    const matchedParts = parts.filter(
      (p) => normalize(p.name).includes(q) || normalize(p.code).includes(q)
    );

    let lowest = null;

    const results = matchedParts
      .map((part) => {
        const quote = quotesByUuid.get(part.quote_uuid);
        const partBids = (bidsByPartId.get(part.id) || [])
          .map((b) => {
            const supplier = suppliersById.get(b.supplier_id);
            const entry = {
              price: b.price,
              notes: b.notes,
              company: supplier ? supplier.company : 'Proveedor desconocido',
              phone: supplier ? supplier.phone : '',
            };

            if (!lowest || entry.price < lowest.price) {
              lowest = {
                price: entry.price,
                company: entry.company,
                phone: entry.phone,
                partName: part.name,
                quoteTitle: quote ? quote.title : '',
                date: quote ? quote.created_at : '',
              };
            }

            return entry;
          })
          .sort((a, b) => a.price - b.price);

        return {
          partId: part.id,
          name: part.name,
          code: part.code,
          unit: part.unit,
          description: part.description,
          quoteUuid: part.quote_uuid,
          quoteTitle: quote ? quote.title : '(cotización eliminada)',
          quoteStatus: quote ? quote.status : null,
          quoteDate: quote ? quote.created_at : null,
          bids: partBids,
        };
      })
      // Cotizaciones más recientes primero
      .sort((a, b) => (a.quoteDate < b.quoteDate ? 1 : -1));

    res.status(200).json({ results, lowest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
