const crypto = require('crypto');
const { requireAuth } = require('./_lib/auth');
const { getRows, appendRows, updateRow, deleteRow, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  try {
    await ensureReady();

    // Determinar qué endpoint se está llamando según la URL
    const url = req.url;

    // /api/quote-edit
    if (url.startsWith('/api/quote-edit')) {
      const uuid = req.query.uuid || (req.body && req.body.uuid);
      if (!uuid) {
        res.status(400).json({ error: 'Falta el parámetro uuid' });
        return;
      }

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
            hasBids: bidPartIds.has(p.id),
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

        // Actualizar título
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

        // Borrar repuestos removidos
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
      return;
    }

    // /api/quote-status
    if (url.startsWith('/api/quote-status')) {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido' });
        return;
      }
      const { uuid, status } = req.body || {};
      if (!uuid || !['ACTIVE', 'CLOSED'].includes(status)) {
        res.status(400).json({ error: 'Parámetros inválidos' });
        return;
      }
      const quotes = await getRows('Quotes');
      const target = quotes.find((q) => q.uuid === uuid);
      if (!target) {
        res.status(404).json({ error: 'Cotización no encontrada' });
        return;
      }
      const { _row, ...rest } = target;
      await updateRow('Quotes', _row, { ...rest, status });
      res.status(200).json({ ok: true });
      return;
    }

    // /api/set-winner
    if (url.startsWith('/api/set-winner')) {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método no permitido' });
        return;
      }
      const { quoteUuid, partId, supplierId } = req.body || {};
      if (!quoteUuid || !partId) {
        res.status(400).json({ error: 'Parámetros inválidos' });
        return;
      }
      const winners = await getRows('Winners');
      const existing = winners.find((w) => w.quote_uuid === quoteUuid && w.part_id === partId);

      if (!supplierId) {
        if (existing) await deleteRow('Winners', existing._row);
        res.status(200).json({ ok: true });
        return;
      }

      if (existing) {
        await updateRow('Winners', existing._row, {
          quote_uuid: quoteUuid,
          part_id: partId,
          supplier_id: supplierId,
          chosen_at: new Date().toISOString(),
        });
      } else {
        await appendRow('Winners', {
          quote_uuid: quoteUuid,
          part_id: partId,
          supplier_id: supplierId,
          chosen_at: new Date().toISOString(),
        });
      }

      res.status(200).json({ ok: true });
      return;
    }

    // Si no coincide ninguna ruta
    res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};