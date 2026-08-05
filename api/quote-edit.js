const crypto = require('crypto');
const { requireAuth } = require('./_lib/auth');
const { getRows, appendRows, updateRow, deleteRow, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const uuid = req.query.uuid || (req.body && req.body.uuid);
  if (!uuid) {
    res.status(400).json({ error: 'Falta el parámetro uuid' });
    return;
  }

  try {
    await ensureReady();

    if (req.method === 'GET') {
      const [quotes, allParts, allBids] = await Promise.all([
        getRows('Quotes'),
        getRows('Parts'),
        getRows('Bids'),
      ]);

      const quote = quotes.find((q) => q.uuid === uuid);
      if (!quote) {
        res.status(404).json({ error: 'Cotización no encontrada' });
        return;
      }

      const bidPartIds = new Set(allBids.map((b) => b.part_id));

      const parts = allParts
        .filter((p) => p.quote_uuid === uuid)
        .map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          unit: p.unit,
          description: p.description,
          quantity: Number(p.quantity) > 0 ? Number(p.quantity) : 1,
          hasBids: bidPartIds.has(p.id), // si ya tiene precios, no se puede borrar
        }));

      res.status(200).json({ uuid: quote.uuid, title: quote.title, status: quote.status, parts });
      return;
    }

    if (req.method === 'POST') {
      const { title, parts, removedPartIds } = req.body || {};
      const cleanTitle = (title || '').trim();
      if (!cleanTitle) {
        res.status(400).json({ error: 'El título es obligatorio' });
        return;
      }

      const [quotes, allParts, allBids] = await Promise.all([
        getRows('Quotes'),
        getRows('Parts'),
        getRows('Bids'),
      ]);

      const quote = quotes.find((q) => q.uuid === uuid);
      if (!quote) {
        res.status(404).json({ error: 'Cotización no encontrada' });
        return;
      }

      // 1. Actualizar título si cambió
      if (quote.title !== cleanTitle) {
        const { _row, ...rest } = quote;
        await updateRow('Quotes', _row, { ...rest, title: cleanTitle });
      }

      const existingParts = allParts.filter((p) => p.quote_uuid === uuid);
      const existingById = new Map(existingParts.map((p) => [p.id, p]));
      const bidPartIds = new Set(allBids.map((b) => b.part_id));

      const incoming = Array.isArray(parts) ? parts : [];
      const newRows = [];

      for (const p of incoming) {
        const name = (p.name || '').trim();
        if (!name) continue;
        const qty = Number(p.quantity);
        const cleanQty = Number.isFinite(qty) && qty > 0 ? String(qty) : '1';
        const cleanFields = {
          name,
          code: (p.code || '').trim(),
          unit: (p.unit || '').trim(),
          description: (p.description || '').trim(),
          quantity: cleanQty,
        };

        if (p.id && existingById.has(p.id)) {
          const existing = existingById.get(p.id);
          await updateRow('Parts', existing._row, {
            id: existing.id,
            quote_uuid: uuid,
            ...cleanFields,
          });
        } else {
          newRows.push({ id: crypto.randomUUID(), quote_uuid: uuid, ...cleanFields });
        }
      }

      if (newRows.length > 0) {
        await appendRows('Parts', newRows);
      }

      // 2. Borrar repuestos removidos (solo si NO tienen precios ya recibidos).
      // Se borra de mayor a menor número de fila para que un borrado no
      // desfase el número de fila de los siguientes pendientes.
      const blocked = [];
      const toRemove = (Array.isArray(removedPartIds) ? removedPartIds : [])
        .map((partId) => existingById.get(partId))
        .filter(Boolean)
        .sort((a, b) => b._row - a._row);

      for (const existing of toRemove) {
        if (bidPartIds.has(existing.id)) {
          blocked.push(existing.name);
          continue;
        }
        await deleteRow('Parts', existing._row);
      }

      res.status(200).json({
        ok: true,
        blocked: blocked.length > 0 ? blocked : undefined,
      });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
