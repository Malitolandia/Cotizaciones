let partKeyCounter = 0;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// ---------------------------------------------------------------------
// Verificación de sesión
// ---------------------------------------------------------------------
async function checkSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/admin-login.html?next=/admin.html';
      return false;
    }
    return true;
  } catch {
    window.location.href = '/admin-login.html?next=/admin.html';
    return false;
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/admin-login.html';
});

// ---------------------------------------------------------------------
// Formulario dinámico de repuestos
// ---------------------------------------------------------------------
const partsList = document.getElementById('parts-list');

function addPartRow() {
  const key = partKeyCounter++;
  const row = document.createElement('div');
  row.className = 'part-row';
  row.dataset.key = key;
  row.dataset.image = '';
  row.innerHTML = `
    <div class="part-row-header">
      <span>Repuesto</span>
      <button type="button" class="remove-link" data-remove="${key}">Quitar</button>
    </div>
    <div class="part-with-image">
      <div class="part-fields">
        <div class="grid-3">
          <input type="text" class="part-name" list="parts-catalog" placeholder="Nombre del repuesto *" required />
          <input type="text" class="part-code" placeholder="Código / referencia" />
          <input type="number" class="part-quantity" placeholder="Cantidad" min="1" step="1" value="1" />
        </div>
        <div class="grid-2" style="margin-top:8px;">
          <input type="text" class="part-unit" placeholder="Unidad (ej: unidad, par)" />
          <input type="text" class="part-description" placeholder="Descripción / notas" />
        </div>
      </div>
      <div class="part-image-box">
        <label class="image-upload-label">
          <input type="file" class="part-image-input" accept="image/jpeg,image/png" hidden />
          <span class="image-upload-placeholder">📷<br>Foto</span>
          <img class="image-thumb" style="display:none;" alt="Foto del repuesto" />
        </label>
        <button type="button" class="remove-image-link" style="display:none;">Quitar foto</button>
      </div>
    </div>
  `;
  partsList.appendChild(row);
  attachImageHandlers(row);
  updateRemoveButtons();
}

function attachImageHandlers(row) {
  const fileInput = row.querySelector('.part-image-input');
  const thumb = row.querySelector('.image-thumb');
  const placeholder = row.querySelector('.image-upload-placeholder');
  const removeBtn = row.querySelector('.remove-image-link');

  function setImage(dataUrl) {
    row.dataset.image = dataUrl || '';
    if (dataUrl) {
      thumb.src = dataUrl;
      thumb.style.display = 'block';
      placeholder.style.display = 'none';
      removeBtn.style.display = 'inline';
    } else {
      thumb.src = '';
      thumb.style.display = 'none';
      placeholder.style.display = 'block';
      removeBtn.style.display = 'none';
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    placeholder.textContent = 'Procesando…';
    try {
      const compressed = await compressImageFile(file);
      setImage(compressed);
    } catch (err) {
      alert(err.message || 'No se pudo procesar la imagen.');
    } finally {
      placeholder.innerHTML = '📷<br>Foto';
      fileInput.value = '';
    }
  });

  removeBtn.addEventListener('click', () => setImage(''));
}

function updateRemoveButtons() {
  const rows = partsList.querySelectorAll('.part-row');
  rows.forEach((row) => {
    const btn = row.querySelector('.remove-link');
    btn.style.display = rows.length > 1 ? 'inline' : 'none';
  });
}

partsList.addEventListener('click', (e) => {
  if (e.target.matches('[data-remove]')) {
    const row = e.target.closest('.part-row');
    if (partsList.querySelectorAll('.part-row').length > 1) {
      row.remove();
      updateRemoveButtons();
    }
  }
});

document.getElementById('add-part-btn').addEventListener('click', addPartRow);
addPartRow();

async function loadPartCatalog() {
  try {
    const res = await fetch('/api/part-catalog');
    if (!res.ok) return;
    const data = await res.json();
    const datalist = document.getElementById('parts-catalog');
    datalist.innerHTML = (data.catalog || [])
      .map((p) => `<option value="${escapeHtml(p.name)}"></option>`)
      .join('');
  } catch {
    // Autocompletado es un plus, si falla no bloqueamos nada
  }
}

// ---------------------------------------------------------------------
// Crear cotización
// ---------------------------------------------------------------------
const createForm = document.getElementById('create-form');
const createErrorBox = document.getElementById('create-error');
const createSubmitBtn = document.getElementById('create-submit-btn');

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createErrorBox.innerHTML = '';

  const title = document.getElementById('title').value.trim();
  const parts = Array.from(partsList.querySelectorAll('.part-row')).map((row) => ({
    name: row.querySelector('.part-name').value.trim(),
    code: row.querySelector('.part-code').value.trim(),
    unit: row.querySelector('.part-unit').value.trim(),
    description: row.querySelector('.part-description').value.trim(),
    quantity: row.querySelector('.part-quantity').value.trim() || '1',
    image: row.dataset.image || '',
  })).filter((p) => p.name.length > 0);

  if (!title) {
    createErrorBox.innerHTML = '<div class="alert-error">El título es obligatorio.</div>';
    return;
  }
  if (parts.length === 0) {
    createErrorBox.innerHTML = '<div class="alert-error">Agrega al menos un repuesto.</div>';
    return;
  }

  createSubmitBtn.disabled = true;
  createSubmitBtn.textContent = 'Guardando…';

  try {
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, parts }),
    });
    const data = await res.json();

    if (!res.ok) {
      createErrorBox.innerHTML = `<div class="alert-error">${escapeHtml(data.error || 'Error al guardar')}</div>`;
      return;
    }

    document.getElementById('created-alert').innerHTML =
      '<div class="alert-success">✅ Cotización creada. Copia el enlace de abajo y envíalo a tus proveedores.</div>';

    createForm.reset();
    partsList.innerHTML = '';
    partKeyCounter = 0;
    addPartRow();

    await loadQuotes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    createErrorBox.innerHTML = '<div class="alert-error">Error de conexión. Intenta de nuevo.</div>';
  } finally {
    createSubmitBtn.disabled = false;
    createSubmitBtn.textContent = 'Crear cotización';
  }
});

// ---------------------------------------------------------------------
// Listado de cotizaciones
// ---------------------------------------------------------------------
const quotesListEl = document.getElementById('quotes-list');

function quoteLink(uuid) {
  return `${window.location.origin}/cotizar.html?uuid=${uuid}`;
}

async function loadQuotes() {
  quotesListEl.innerHTML = '<p class="spinner-text">Cargando…</p>';
  try {
    const res = await fetch('/api/quotes');
    if (res.status === 401) {
      window.location.href = '/admin-login.html?next=/admin.html';
      return;
    }
    const data = await res.json();
    renderQuotes(data.quotes || []);
  } catch {
    quotesListEl.innerHTML = '<p class="alert-error">No se pudieron cargar las cotizaciones.</p>';
  }
}

function renderQuotes(quotes) {
  if (quotes.length === 0) {
    quotesListEl.innerHTML = '<div class="card muted">Aún no has creado ninguna cotización.</div>';
    return;
  }

  quotesListEl.innerHTML = quotes
    .map((q) => {
      const link = quoteLink(q.uuid);
      const created = q.created_at ? new Date(q.created_at).toLocaleString('es-CO') : '';
      const badgeClass = q.status === 'ACTIVE' ? 'badge-active' : 'badge-closed';
      const badgeLabel = q.status === 'ACTIVE' ? 'Activa' : 'Cerrada';
      const toggleLabel = q.status === 'ACTIVE' ? '🔒 Cerrar' : '🔓 Reabrir';

      return `
        <div class="card" data-uuid="${q.uuid}">
          <div class="row-between">
            <div>
              <p style="font-weight:700; margin:0;">${escapeHtml(q.title)}</p>
              <p class="muted" style="margin: 2px 0 0;">Creada el ${created}</p>
              <span class="badge ${badgeClass}" style="margin-top:6px;">${badgeLabel}</span>
            </div>
            <div>
              <a href="/results.html?uuid=${q.uuid}" class="btn btn-secondary">Ver resultados</a>
              <a href="/editar.html?uuid=${q.uuid}" class="btn-secondary" style="margin-top:6px; display:inline-flex;">✏️ Editar</a>
            </div>
          </div>
          <div class="link-box">${link}</div>
          <div class="row-between" style="margin-top: 10px;">
            <button class="btn-secondary copy-btn" data-link="${link}">🔗 Copiar enlace</button>
            <button class="btn-secondary toggle-btn" data-uuid="${q.uuid}" data-status="${q.status}">${toggleLabel}</button>
          </div>
        </div>
      `;
    })
    .join('');
}

quotesListEl.addEventListener('click', async (e) => {
  if (e.target.matches('.copy-btn')) {
    const link = e.target.dataset.link;
    try {
      await navigator.clipboard.writeText(link);
      const original = e.target.textContent;
      e.target.textContent = '✅ Copiado';
      setTimeout(() => (e.target.textContent = original), 1800);
    } catch {
      window.prompt('Copia el enlace:', link);
    }
  }

  if (e.target.matches('.toggle-btn')) {
    const uuid = e.target.dataset.uuid;
    const current = e.target.dataset.status;
    const next = current === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    e.target.disabled = true;
    try {
      await fetch('/api/quote-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, status: next }),
      });
      await loadQuotes();
    } finally {
      e.target.disabled = false;
    }
  }
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
(async function init() {
  const ok = await checkSession();
  if (ok) {
    await loadQuotes();
    loadPartCatalog();
  }
})();
