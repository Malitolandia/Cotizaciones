const crypto = require('crypto');
const { getRows, appendRow, ensureReady } = require('./_lib/sheets');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { uuid, company, phone, email } = req.body || {};
  const cleanCompany = (company || '').trim();
  const cleanPhone = (phone || '').trim();
  const cleanEmail = (email || '').trim();

  if (!uuid || !cleanCompany || !cleanPhone) {
    res.status(400).json({ error: 'Empresa y teléfono son obligatorios' });
    return;
  }

  try {
    await ensureReady();

    const quotes = await getRows('Quotes');
    const quote = quotes.find((q) => q.uuid === uuid);
    if (!quote) {
      res.status(404).json({ error: 'Cotización no encontrada' });
      return;
    }
    if (quote.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Esta cotización ya fue cerrada' });
      return;
    }

    const suppliers = await getRows('Suppliers');
    const normalized = cleanPhone.replace(/\D/g, '');
    const existing = suppliers.find(
      (s) => s.quote_uuid === uuid && s.phone.replace(/\D/g, '') === normalized
    );

    if (existing) {
      res.status(409).json({
        error:
          'Este número de teléfono ya envió una cotización para este listado. Si necesitas corregir precios, contacta al administrador.',
      });
      return;
    }

    const supplierId = crypto.randomUUID();
    await appendRow('Suppliers', {
      id: supplierId,
      quote_uuid: uuid,
      company: cleanCompany,
      phone: cleanPhone,
      email: cleanEmail,
      submitted_at: new Date().toISOString(),
    });

    res.status(201).json({ supplierId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al comunicarse con Google Sheets' });
  }
};
