function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const app = document.getElementById('app');
const uuid = new URLSearchParams(window.location.search).get('uuid');

async function init() {
  if (!uuid) {
    app.innerHTML = '<div class="card alert-error">Falta el identificador de la cotización.</div>';
    return;
  }

  try {
    const res = await fetch(`/api/results?uuid=${encodeURIComponent(uuid)}`);

    if (res.status === 401) {
      window.location.href = `/admin-login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      app.innerHTML = `<div class="card alert-error">${escapeHtml(data.error || 'Error al cargar resultados')}</div>`;
      return;
    }

    render(data);
  } catch {
    app.innerHTML = '<div class="card alert-error">Error de conexión. Intenta de nuevo.</div>';
  }
}

function render(data) {
  const { title, parts, suppliers, bids } = data;

  const header = `
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${suppliers.length} proveedor${suppliers.length === 1 ? '' : 'es'} · ${parts.length} repuesto${parts.length === 1 ? '' : 's'}</p>
  `;

  if (suppliers.length === 0) {
    app.innerHTML = `${header}<div class="card text-center muted" style="margin-top:16px;">Aún no hay cotizaciones de proveedores.</div>`;
    return;
  }

  // priceMap[partId][supplierId] = price
  const priceMap = {};
  bids.forEach((b) => {
    if (!priceMap[b.partId]) priceMap[b.partId] = {};
    priceMap[b.partId][b.supplierId] = b.price;
  });

  const totals = {};
  suppliers.forEach((s) => {
    totals[s.id] = parts.reduce((sum, part) => {
      const price = priceMap[part.id]?.[s.id];
      return price !== undefined ? sum + price : sum;
    }, 0);
  });

  function lowestForPart(partId) {
    const row = priceMap[partId];
    if (!row) return null;
    const values = Object.values(row);
    return values.length ? Math.min(...values) : null;
  }

  const tableHeaders = suppliers.map((s) => `<th>${escapeHtml(s.company)}</th>`).join('');

  const tableRows = parts
    .map((part) => {
      const lowest = lowestForPart(part.id);
      const cells = suppliers
        .map((s) => {
          const price = priceMap[part.id]?.[s.id];
          const isLowest = price !== undefined && price === lowest;
          return `<td class="${isLowest ? 'cell-lowest' : ''}">${price !== undefined ? currency.format(price) : '—'}</td>`;
        })
        .join('');
      return `
        <tr>
          <td class="sticky-col">
            ${escapeHtml(part.name)}
            ${part.code ? `<span class="muted" style="display:block; font-size:0.72rem;">${escapeHtml(part.code)}</span>` : ''}
          </td>
          ${cells}
        </tr>
      `;
    })
    .join('');

  const totalCells = suppliers.map((s) => `<td>${currency.format(totals[s.id] || 0)}</td>`).join('');

  const contactCards = suppliers
    .map(
      (s) => `
      <div class="card">
        <p style="font-weight:700; margin:0;">${escapeHtml(s.company)}</p>
        <p class="muted" style="margin:4px 0 0;">📞 ${escapeHtml(s.phone)}</p>
        ${s.email ? `<p class="muted" style="margin:2px 0 0;">✉️ ${escapeHtml(s.email)}</p>` : ''}
        <p class="muted" style="margin-top:6px; font-size:0.75rem;">Total cotizado: ${currency.format(totals[s.id] || 0)}</p>
      </div>
    `
    )
    .join('');

  app.innerHTML = `
    ${header}
    <div class="card table-scroll" style="margin-top:16px;">
      <table>
        <thead>
          <tr>
            <th class="sticky-col">Repuesto</th>
            ${tableHeaders}
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr>
            <td class="sticky-col">Total</td>
            ${totalCells}
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="margin-top:24px;">
      <h2>Contactos de proveedores</h2>
      <div class="contact-grid" style="margin-top:12px;">
        ${contactCards}
      </div>
    </div>
  `;
}

init();
