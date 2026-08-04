const { requireAuth } = require('./_lib/auth');
const { getRows, appendRow, updateRow, deleteRow, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  if (!requireAuth(req, res)) return;

  const { quoteUuid, partId, supplierId } = req.body || {};
  if (!quoteUuid || !partId) {
    res.status(400).json({ error: 'Parámetros inválidos' });
    return;
  }

  try {
    await ensureReady();
    const winners = await getRows('Winners');
    const existing = winners.find((w) => w.quote_uuid === quoteUuid && w.part_id === partId);

    if (!supplierId) {
      // Quitar selección
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
