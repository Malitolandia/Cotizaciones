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

let partKeyCounter = 0;
const removedPartIds = [];

// --- Manejo de imagen de la cotización en edición ---
let editQuoteImageData = '';

function createQuoteImageHTML(existingImage) {
  const hasImage = existingImage && existingImage.length > 0;
  return `
    <div class="field" style="margin-top: 12px;">
      <label class="label">Imagen de la cotización (opcional)</label>
      <div class="quote-image-box">
        <label class="image-upload-label" id="edit-quote-image-label">
          <input type="file" id="edit-quote-image-input" accept="image/jpeg,image/png" hidden />
          <span class="image-upload-placeholder" id="edit-quote-image-placeholder" style="${hasImage ? 'display:none;' : ''}">📷<br>Subir imagen</span>
          <img class="image-thumb" id="edit-quote-image-thumb" style="${hasImage ? '' : 'display:none;'}" src="${escapeHtml(existingImage || '')}" alt="Imagen de la cotización" />
        </label>
        <button type="button" id="edit-quote-remove-image" class="remove-image-link" style="${hasImage ? '' : 'display:none;'}">Quitar imagen</button>
      </div>
    </div>
  `;
}

function setupEditQuoteImage() {
  const input = document.getElementById('edit-quote-image-input');
  const thumb = document.getElementById('edit-quote-image-thumb');
  const placeholder = document.getElementById('edit-quote-image-placeholder');
  const removeBtn = document.getElementById('edit-quote-remove-image');

  function setImage(dataUrl) {
    editQuoteImageData = dataUrl || '';
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

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    placeholder.textContent = 'Procesando…';
    try {
      const compressed = await compressImageFile(file);
      setImage(compressed);
    } catch (err) {
      alert(err.message || 'No se pudo procesar la imagen.');
    } finally {
      placeholder.innerHTML = '📷<br>Subir imagen';
      input.value = '';
    }
  });

  removeBtn.addEventListener('click', () => setImage(''));

  const initialImage = thumb.src;
  if (initialImage && initialImage.length > 0) {
    editQuoteImageData = initialImage;
  }
}

async function checkSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = `/admin-login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return false;
    }
    return true;
  } catch {
    window.location.href = '/admin-login.html';
    return false;
  }
}

async function loadPartCatalog() {
  try {
    const res = await fetch('/api/part-catalog');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('parts-catalog').innerHTML = (data.catalog || [])
      .map((p) => `<option value="${escapeHtml(p.name)}"></option>`)
      .join('');
  } catch {
    /* no-op */
  }
}

// ---------- Fila de repuesto en edición (SOLO nombre + cantidad + foto) ----------
function partRowHtml(part) {
  const key = partKeyCounter++;
  const removable = !part || !part.hasBids;
  const initialImage = part && part.image ? part.image : '';
  return `
    <div class="part-row" data-key="${key}" data-part-id="${part ? part.id : ''}" data-image="${escapeHtml(initialImage)}">
      <div class="part-row-header">
        <span>${part && part.hasBids ? 'Repuesto (ya tiene precios recibidos)' : 'Repuesto'}</span>
        ${removable ? `<button type="button" class="remove-link" data-remove="${key}">Quitar</button>` : ''}
      </div>
      <div class="part-with-image">
        <div class="part-fields">
          <div class="grid-2">
            <input type="text" class="part-name" list="parts-catalog" placeholder="Nombre del repuesto *" required value="${escapeHtml(part ? part.name : '')}" />
            <input type="number" class="part-quantity" placeholder="Cantidad" min="1" step="1" value="${part ? part.quantity : 1}" />
          </div>
        </div>
        <div class="part-image-box">
          <label class="image-upload-label">
            <input type="file" class="part-image-input" accept="image/jpeg,image/png" hidden />
            <span class="image-upload-placeholder" style="${initialImage ? 'display:none;' : ''}">📷<br>Foto</span>
            <img class="image-thumb" style="${initialImage ? '' : 'display:none;'}" src="${initialImage}" alt="Foto del repuesto" />
          </label>
          <button type="button" class="remove-image-link" style="${initialImage ? '' : 'display:none;'}">Quitar foto</button>
        </div>
      </div>
    </div>
  `;
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

function attachRemoveHandlers(container) {
  container.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.part-row');
      const partId = row.dataset.partId;
      if (partId) removedPartIds.push(partId);
      row.remove();
    });
  });
}

async function init() {
  if (!uuid) {
    app.innerHTML = '<div class="card alert-error">Falta el identificador de la cotización.</div>';
    return;
  }

  const ok = await checkSession();
  if (!ok) return;

  loadPartCatalog();

  try {
    const res = await fetch(`/api/quote-edit?uuid=${encodeURIComponent(uuid)}`);
    const data = await res.json();

    if (!res.ok) {
      app.innerHTML = `<div class="card alert-error">${escapeHtml(data.error || 'Error al cargar')}</div>`;
      return;
    }

    render(data);
  } catch {
    app.innerHTML = '<div class="card alert-error">Error de conexión.</div>';
  }
}

function render(data) {
  const imageHtml = createQuoteImageHTML(data.image || '');

  app.innerHTML = `
    <form id="edit-form" class="card">
      <h2>Editar cotización</h2>

      <div class="field" style="margin-top: 16px;">
        <label class="label" for="title">Título</label>
        <input id="title" type="text" required value="${escapeHtml(data.title)}" />
      </div>

      ${imageHtml}

      <div style="margin-top: 20px;">
        <div class="row-between" style="margin-bottom: 8px;">
          <span class="label" style="margin-bottom: 0;">Repuestos</span>
          <button type="button" id="add-part-btn" class="btn-secondary">+ Agregar repuesto</button>
        </div>
        <div id="parts-list">
          ${data.parts.map(partRowHtml).join('')}
        </div>
      </div>

      <div id="edit-error"></div>
      <div id="edit-blocked"></div>

      <button type="submit" id="save-btn" class="btn btn-primary" style="margin-top:16px;">Guardar cambios</button>
    </form>
  `;

  setupEditQuoteImage();

  const partsList = document.getElementById('parts-list');
  attachRemoveHandlers(partsList);
  partsList.querySelectorAll('.part-row').forEach(attachImageHandlers);

  document.getElementById('add-part-btn').addEventListener('click', () => {
    partsList.insertAdjacentHTML('beforeend', partRowHtml(null));
    attachRemoveHandlers(partsList);
    attachImageHandlers(partsList.lastElementChild);
  });

  const form = document.getElementById('edit-form');
  const errorBox = document.getElementById('edit-error');
  const blockedBox = document.getElementById('edit-blocked');
  const saveBtn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    blockedBox.innerHTML = '';

    const title = document.getElementById('title').value.trim();
    const image = editQuoteImageData;
    const parts = Array.from(partsList.querySelectorAll('.part-row')).map((row) => ({
      id: row.dataset.partId || undefined,
      name: row.querySelector('.part-name').value.trim(),
      code: '',          // eliminado
      unit: '',          // eliminado
      description: '',   // eliminado
      quantity: row.querySelector('.part-quantity').value.trim() || '1',
      image: row.dataset.image || '',
    })).filter((p) => p.name.length > 0);

    if (!title) {
      errorBox.innerHTML = '<div class="alert-error">El título es obligatorio.</div>';
      return;
    }
    if (parts.length === 0) {
      errorBox.innerHTML = '<div class="alert-error">Debe quedar al menos un repuesto.</div>';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';

    try {
      const res = await fetch(`/api/quote-edit?uuid=${encodeURIComponent(uuid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parts, removedPartIds, image }),
      });
      const result = await res.json();

      if (!res.ok) {
        errorBox.innerHTML = `<div class="alert-error">${escapeHtml(result.error || 'Error al guardar')}</div>`;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar cambios';
        return;
      }

      if (result.blocked && result.blocked.length > 0) {
        blockedBox.innerHTML = `<div class="alert-error">No se pudieron eliminar (ya tienen precios recibidos): ${result.blocked.map(escapeHtml).join(', ')}</div>`;
      }

      window.location.href = '/admin.html';
    } catch {
      errorBox.innerHTML = '<div class="alert-error">Error de conexión.</div>';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';
    }
  });
}

init();