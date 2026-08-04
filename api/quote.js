const { getRows, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const uuid = req.query.uuid;
  if (!uuid) {
    res.status(400).json({ error: 'Falta el parámetro uuid' });
    return;
  }

  try {
    await ensureReady();
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
