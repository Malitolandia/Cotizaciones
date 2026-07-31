function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

const app = document.getElementById('app');
const uuid = new URLSearchParams(window.location.search).get('uuid');

let quoteData = null;

function renderHeader(title) {
  return `
    <div style="text-align:center; margin-bottom: 20px;">
      <p class="muted" style="text-transform:uppercase; letter-spacing:0.05em; font-weight:700; font-size:0.72rem;">
        Solicitud de cotización
      </p>
      <h1 style="margin-top:4px;">${escapeHtml(title)}</h1>
    </div>
  `;
}

function renderRegisterStep() {
  app.innerHTML = `
    ${renderHeader(quoteData.title)}
    <form id="register-form" class="card">
      <h2>Datos de tu empresa</h2>
      <p class="subtitle">Ingresa tus datos antes de cotizar los repuestos.</p>

      <div class="field">
        <label class="label" for="company">Empresa *</label>
        <input id="company" type="text" required />
      </div>
      <div class="field">
        <label class="label" for="phone">Teléfono (WhatsApp) *</label>
        <input id="phone" type="tel" required />
      </div>
      <div class="field">
        <label class="label" for="email">Email (opcional)</label>
        <input id="email" type="email" />
      </div>

      <div id="register-error"></div>

      <button type="submit" id="register-submit" class="btn btn-primary">Continuar</button>
    </form>
  `;

  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('register-error');
  const submitBtn = document.getElementById('register-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';

    const company = document.getElementById('company').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, company, phone, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorBox.innerHTML = `<div class="alert-error">${escapeHtml(data.error || 'Error al enviar')}</div>`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continuar';
        return;
      }

      renderBidsStep(data.supplierId);
    } catch {
      errorBox.innerHTML = '<div class="alert-error">Error de conexión. Intenta de nuevo.</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continuar';
    }
  });
}

function renderBidsStep(supplierId) {
  const partsHtml = quoteData.parts
    .map(
      (part) => `
      <div class="part-row">
        <p style="font-weight:700; margin:0;">${escapeHtml(part.name)}</p>
        ${
          part.code || part.unit
            ? `<p class="muted" style="margin:2px 0;">${part.code ? 'Código: ' + escapeHtml(part.code) : ''} ${
                part.unit ? '· Unidad: ' + escapeHtml(part.unit) : ''
              }</p>`
            : ''
        }
        ${part.description ? `<p class="muted" style="margin:2px 0 8px;">${escapeHtml(part.description)}</p>` : ''}
        <div class="grid-2" style="margin-top:8px;">
          <input type="number" step="0.01" min="0" class="bid-price" data-part-id="${part.id}" placeholder="Precio (COP)" />
          <input type="text" class="bid-notes" data-part-id="${part.id}" placeholder="Notas (opcional)" />
        </div>
      </div>
    `
    )
    .join('');

  app.innerHTML = `
    ${renderHeader(quoteData.title)}
    <form id="bids-form" class="card">
      <h2>Ingresa tus precios</h2>
      <p class="subtitle">Completa el precio para cada repuesto (deja en blanco si no manejas alguno).</p>
      ${partsHtml}
      <div id="bids-error"></div>
      <button type="submit" id="bids-submit" class="btn btn-primary" style="margin-top:8px;">Enviar cotización</button>
    </form>
  `;

  const form = document.getElementById('bids-form');
  const errorBox = document.getElementById('bids-error');
  const submitBtn = document.getElementById('bids-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando precios…';

    const bids = Array.from(document.querySelectorAll('.bid-price'))
      .map((input) => ({
        partId: input.dataset.partId,
        price: input.value.trim(),
        notes: document.querySelector(`.bid-notes[data-part-id="${input.dataset.partId}"]`).value.trim(),
      }))
      .filter((b) => b.price.length > 0);

    if (bids.length === 0) {
      errorBox.innerHTML = '<div class="alert-error">Ingresa al menos un precio válido.</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar cotización';
      return;
    }

    try {
      const res = await fetch('/api/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, bids }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorBox.innerHTML = `<div class="alert-error">${escapeHtml(data.error || 'Error al enviar')}</div>`;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar cotización';
        return;
      }

      app.innerHTML = `
        ${renderHeader(quoteData.title)}
        <div class="card text-center">
          <p style="font-size:1.8rem; margin:0;">✅</p>
          <h2 style="margin-top:8px;">¡Cotización enviada!</h2>
          <p class="subtitle" style="margin-top:4px;">Gracias por tu tiempo. El administrador revisará tu propuesta.</p>
        </div>
      `;
    } catch {
      errorBox.innerHTML = '<div class="alert-error">Error de conexión. Intenta de nuevo.</div>';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar cotización';
    }
  });
}

async function init() {
  if (!uuid) {
    app.innerHTML = '<div class="card alert-error">Enlace inválido: falta el identificador de la cotización.</div>';
    return;
  }

  try {
    const res = await fetch(`/api/quote?uuid=${encodeURIComponent(uuid)}`);
    const data = await res.json();

    if (!res.ok) {
      app.innerHTML = `<div class="card text-center">${escapeHtml(data.error || 'Cotización no encontrada')}</div>`;
      return;
    }

    quoteData = data;

    if (data.status === 'CLOSED') {
      app.innerHTML = `
        ${renderHeader(data.title)}
        <div class="card text-center muted">
          Esta cotización ya fue cerrada por el administrador. Gracias por tu interés.
        </div>
      `;
      return;
    }

    if (!data.parts || data.parts.length === 0) {
      app.innerHTML = `
        ${renderHeader(data.title)}
        <div class="card text-center muted">
          Esta cotización aún no tiene repuestos cargados.
        </div>
      `;
      return;
    }

    renderRegisterStep();
  } catch {
    app.innerHTML = '<div class="card alert-error">Error de conexión. Intenta de nuevo más tarde.</div>';
  }
}

init();
