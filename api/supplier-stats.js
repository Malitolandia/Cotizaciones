const { requireAuth } = require('./_lib/auth');
const { getRows, ensureReady } = require('./_lib/sheets');

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
    const [suppliers, bids, parts, winners] = await Promise.all([
      getRows('Suppliers'),
      getRows('Bids'),
      getRows('Parts'),
      getRows('Winners'),
    ]);

    // Agrupamos por teléfono normalizado: el mismo proveedor puede haberse
    // registrado varias veces (una fila de Suppliers por cada cotización).
    const groups = new Map(); // phoneKey -> stats

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
      // Nos quedamos con el nombre/fecha de la participación más reciente
      if (!g.lastSubmittedAt || s.submitted_at > g.lastSubmittedAt) {
        g.lastSubmittedAt = s.submitted_at;
        g.company = s.company;
      }
    });

    // supplier_id -> phoneKey, para poder cruzar bids y winners
    const supplierIdToKey = new Map();
    suppliers.forEach((s) => supplierIdToKey.set(s.id, normalizePhone(s.phone)));

    // bidsGiven + timesLowestPrice
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
