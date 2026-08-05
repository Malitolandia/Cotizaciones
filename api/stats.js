const { requireAuth } = require('./_lib/auth');
const { getRows, ensureReady } = require('./_lib/sheets');

// Función normalize (compartida)
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (!requireAuth(req, res)) return;

  try {
    await ensureReady();
    const url = req.url;

    // /api/part-catalog
    if (url.startsWith('/api/part-catalog')) {
      const parts = await getRows('Parts');
      const seen = new Map();
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
      return;
    }

    // /api/search-parts
    if (url.startsWith('/api/search-parts')) {
      const q = normalize(req.query.q || '');
      if (q.length < 2) {
        res.status(200).json({ results: [], lowest: null });
        return;
      }

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
        .sort((a, b) => (a.quoteDate < b.quoteDate ? 1 : -1));

      res.status(200).json({ results, lowest });
      return;
    }

    // /api/supplier-stats
    if (url.startsWith('/api/supplier-stats')) {
      const [suppliers, bids, parts, winners] = await Promise.all([
        getRows('Suppliers'),
        getRows('Bids'),
        getRows('Parts'),
        getRows('Winners'),
      ]);

      const groups = new Map();

      suppliers.forEach((s) => {
        const key = normalizePhone(s.phone);
        if (!key) return;
        if (!groups.has(key)) {
          groups.set(key, {
            phone: s.phone,
            company: s.company,
            lastSubmittedAt: s.submitted_at,
            supplierIds: new Set(),
            quotesInvited: 0,
          });
        }
        const g = groups.get(key);
        g.supplierIds.add(s.id);
        g.quotesInvited += 1;
        if (!g.lastSubmittedAt || s.submitted_at > g.lastSubmittedAt) {
          g.lastSubmittedAt = s.submitted_at;
          g.company = s.company;
        }
      });

      const supplierIdToKey = new Map();
      suppliers.forEach((s) => supplierIdToKey.set(s.id, normalizePhone(s.phone)));

      const bidsByPart = new Map();
      bids.forEach((b) => {
        const price = Number(b.price);
        if (Number.isNaN(price)) return;
        if (!bidsByPart.has(b.part_id)) bidsByPart.set(b.part_id, []);
        bidsByPart.get(b.part_id).push({ ...b, price });

        const key = supplierIdToKey.get(b.supplier_id);
        const g = key && groups.get(key);
        if (g) g.bidsGiven = (g.bidsGiven || 0) + 1;
      });

      bidsByPart.forEach((partBids) => {
        const lowest = Math.min(...partBids.map((b) => b.price));
        const winnersOfPart = partBids.filter((b) => b.price === lowest);
        winnersOfPart.forEach((b) => {
          const key = supplierIdToKey.get(b.supplier_id);
          const g = key && groups.get(key);
          if (g) g.timesLowestPrice = (g.timesLowestPrice || 0) + 1;
        });
      });

      winners.forEach((w) => {
        const key = supplierIdToKey.get(w.supplier_id);
        const g = key && groups.get(key);
        if (g) g.timesChosenWinner = (g.timesChosenWinner || 0) + 1;
      });

      const stats = Array.from(groups.values())
        .map((g) => ({
          company: g.company,
          phone: g.phone,
          quotesInvited: g.quotesInvited,
          bidsGiven: g.bidsGiven || 0,
          timesLowestPrice: g.timesLowestPrice || 0,
          timesChosenWinner: g.timesChosenWinner || 0,
          lastSubmittedAt: g.lastSubmittedAt,
        }))
        .sort((a, b) => b.timesChosenWinner - a.timesChosenWinner || b.timesLowestPrice - a.timesLowestPrice);

      res.status(200).json({ stats });
      return;
    }

    res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};