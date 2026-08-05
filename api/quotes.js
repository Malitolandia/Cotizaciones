const crypto = require('crypto');
const { requireAuth } = require('./_lib/auth');
const { getRows, appendRow, appendRows, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  try {
    await ensureReady();

    if (req.method === 'GET') {
      const uuid = req.query.uuid;
      if (uuid) {
        // Ruta /api/quote?uuid=... (antes en quote.js)
        const [quotes, allParts] = await Promise.all([getRows('Quotes'), getRows('Parts')]);
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
        res.status(200).json({
          uuid: quote.uuid,
          title: quote.title,
          status: quote.status,
          parts,
        });
        return;
      }

      // Si no hay uuid, listar todas (requiere auth)
      if (!requireAuth(req, res)) return;
      const quotes = await getRows('Quotes');
      quotes.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      res.status(200).json({ quotes });
      return;
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res)) return;

      const { title, parts } = req.body || {};
      const cleanTitle = (title || '').trim();

      if (!cleanTitle) {
        res.status(400).json({ error: 'El título es obligatorio' });
        return;
      }

      const cleanParts = (Array.isArray(parts) ? parts : [])
        .map((p) => {
          const qty = Number(p.quantity);
          return {
            id: crypto.randomUUID(),
            name: (p.name || '').trim(),
            code: (p.code || '').trim(),
            unit: (p.unit || '').trim(),
            description: (p.description || '').trim(),
            quantity: Number.isFinite(qty) && qty > 0 ? String(qty) : '1',
          };
        })
        .filter((p) => p.name.length > 0);

      if (cleanParts.length === 0) {
        res.status(400).json({ error: 'Agrega al menos un repuesto' });
        return;
      }

      const uuid = crypto.randomUUID();

      await appendRow('Quotes', {
        uuid,
        title: cleanTitle,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      });

      await appendRows(
        'Parts',
        cleanParts.map((p) => ({ ...p, quote_uuid: uuid }))
      );

      res.status(201).json({ uuid });
      return;
    }

    res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};