// public/js/editar.js
// Depende de image-utils.js (cargado antes en editar.html)

const app = document.getElementById('app');
const uuid = new URLSearchParams(window.location.search).get('uuid');

let editQuoteImageData = '';       // data URL de la imagen de la cotización
let removedPartIds = [];           // IDs de partes existentes que se eliminarán
let originalParts = [];            // para referencia al eliminar

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
// Verificar sesión
// ---------------------------------------------------------------------
async function checkSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (!data.authenticated) {
      window.location.href = '/admin-login.html?next=/editar.html?uuid=' + encodeURIComponent(uuid);
      return false;
    }
    return true;
  } catch {
    window.location.href = '/admin-login.html?next=/editar.html?uuid=' + encodeURIComponent(uuid);
    return false;
  }
}

// ---------------------------------------------------------------------
// Cargar catálogo de repuestos (autocompletado)
// ---------------------------------------------------------------------
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
    // silencioso
  }
}

// ---------------------------------------------------------------------
// Funciones de renderizado de imagen de la cotización (con modal)
// ---------------------------------------------------------------------
function createQuoteImageHTML(imageData) {
  if (!imageData) return '';
  return `
    <div class="field" style="margin-top:12px;">
      <label class="label">Imagen de la cotización</label>
      <div class="quote-image-box">
        <label class="image-upload-label" id="edit-quote-image-label">
          <input type="file" id="edit-quote-image-input" accept="image/jpeg,image/png" hidden />
          <span class="image-upload-placeholder" id="edit-quote-image-placeholder" style="${imageData ? 'display:none;' : ''}">📷<br>Subir imagen</span>
          <img class="image-thumb" id="edit-quote-image-thumb" src="${imageData}" style="${imageData ? 'display:block;' : 'display:none;'}" alt="Imagen de la cotización" />
        </label>
        <button type="button" id="edit-quote-remove-image" class="remove-image-link" style="${imageData ? 'display:inline;' : 'display:none;'}">Quitar imagen</button>
      </div>
      <div id="edit-quote-image-card" style="margin-top:8px; cursor:pointer; ${imageData ? '' : 'display:none;'}">
        <img src="${imageData}" style="max-width:100%; max-height:200px; border-radius:8px;" alt="Vista previa" />
        <p class="muted" style="font-size:0.75rem; margin-top:4px;">Haz clic para ampliar</p>
      </div>
      <div id="edit-image-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; justify-content:center; align-items:center; cursor:pointer;">
        <img src="${imageData}" style="max-width:90%; max-height:90%; border-radius:12px; box-shadow:0 0 40px rgba(0,0,0,0.8);" />
      </div>
    </div>
  `;
}

function setupEditQuoteImage() {
  const input = document.getElementById('edit-quote-image-input');
  const thumb = document.getElementById('edit-quote-image-thumb');
  const placeholder = document.getElementById('edit-quote-image-placeholder');
  const removeBtn = document.getElementById('edit-quote-remove-image');
  const card = document.getElementById('edit-quote-image-card');
  const modal = document.getElementById('edit-image-modal');

  function setImage(dataUrl) {
    editQuoteImageData = dataUrl || '';
    if (dataUrl) {
      thumb.src = dataUrl;
      thumb.style.display = 'block';
      placeholder.style.display = 'none';
      removeBtn.style.display = 'inline';
      card.style.display = 'block';
      card.querySelector('img').src = dataUrl;
      modal.querySelector('img').src = dataUrl;
    } else {
      thumb.src = '';
      thumb.style.display = 'none';
      placeholder.style.display = 'block';
      removeBtn.style.display = 'none';
      card.style.display = 'none';
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

  // Modal zoom
  if (card && modal) {
    card.addEventListener('click', () => { modal.style.display = 'flex'; });
    modal.addEventListener('click', () => { modal.style.display = 'none'; });
  }
}

// ---------------------------------------------------------------------
// Funciones para filas de partes
// ---------------------------------------------------------------------
function partRowHtml(part) {
  const isNew = !part || !part.id;
  const id = part ? part.id : '';
  const name = part ? part.name : '';
  const quantity = part ? part.quantity : 1;
  const image = part ? part.image : '';
  const hasBids = part ? part.hasBids : false;

  return `
    <div class="part-row" data-part-id="${id}" data-has-bids="${hasBids}" data-image="${image}">
      <div class="part-row-header">
        <span>${isNew ? 'Nuevo' : 'Repuesto'}</span>
        ${!isNew ? `<button type="button" class="remove-link" data-remove="${id}">Quitar</button>` : ''}
      </div>
      <div class="part-with-image">
        <div class="part-fields">
          <div class="grid-2">
            <input type="text" class="part-name" list="parts-catalog" placeholder="Nombre del repuesto *" required value="${escapeHtml(name)}" />
            <input type="number" class="part-quantity" placeholder="Cantidad" min="1" step="1" value="${quantity}" />
          </div>
          ${!isNew && hasBids ? `<p class="muted" style="font-size:0.75rem; margin-top:4px;">⚠️ Este repuesto ya recibió precios, no se puede eliminar.</p>` : ''}
        </div>
        <div class="part-image-box">
          <label class="image-upload-label">
            <input type="file" class="part-image-input" accept="image/jpeg,image/png" hidden />
            <span class="image-upload-placeholder" style="${image ? 'display:none;' : ''}">📷<br>Foto</span>
            <img class="image-thumb" src="${image}" style="${image ? 'display:block;' : 'display:none;'}" alt="Foto del repuesto" />
          </label>
          <button type="button" class="remove-image-link" style="${image ? 'display:inline;' : 'display:none;'}">Quitar foto</button>
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
  container.querySelectorAll('.remove-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const partId = e.target.dataset.remove;
      if (!partId) return;
      // No permitir eliminar si tiene bids
      const row = e.target.closest('.part-row');
      if (row && row.dataset.hasBids === 'true') {
        alert('No se puede eliminar este repuesto porque ya recibió precios de proveedores.');
        return;
      }
      if (row) {
        // Si es un repuesto existente (no nuevo), agregar su id a removedPartIds
        if (partId) {
          removedPartIds.push(partId);
        }
        row.remove();
      }
    });
  });
}

// ---------------------------------------------------------------------
// Render principal
// ---------------------------------------------------------------------
function render(data) {
  const { uuid: quoteUuid, title, image, status, parts } = data;

  // Guardar referencia de partes originales para control de eliminación
  originalParts = parts;

  const imageHtml = createQuoteImageHTML(image || '');

  app.innerHTML = `
    <form id="edit-form" class="card">
      <h2>Editar cotización</h2>
      <p class="subtitle" style="margin-top:-4px;">Estado: ${status === 'ACTIVE' ? 'Activa' : 'Cerrada'}</p>

      <div class="field" style="margin-top: 16px;">
        <label class="label" for="title">Título</label>
        <input id="title" type="text" required value="${escapeHtml(title)}" />
      </div>

      ${imageHtml}

      <div style="margin-top: 20px;">
        <span class="label" style="margin-bottom: 8px; display: block;">Repuestos</span>
        <div id="parts-list">
          ${parts.map(p => partRowHtml(p)).join('')}
        </div>
        <div style="margin-top: 12px; text-align: left;">
          <button type="button" id="add-part-btn" class="btn-secondary">+ Agregar repuesto</button>
        </div>
      </div>

      <div id="edit-error"></div>
      <div id="edit-blocked"></div>

      <button type="submit" id="save-btn" class="btn btn-primary" style="margin-top:16px;">Guardar cambios</button>
    </form>
  `;

  // Inicializar imagen de la cotización
  if (image) {
    editQuoteImageData = image;
  }
  setupEditQuoteImage();

  const partsList = document.getElementById('parts-list');
  attachRemoveHandlers(partsList);
  partsList.querySelectorAll('.part-row').forEach(attachImageHandlers);

  // Botón agregar repuesto
  document.getElementById('add-part-btn').addEventListener('click', () => {
    const newRow = document.createElement('div');
    newRow.innerHTML = partRowHtml(null);
    const row = newRow.firstElementChild;
    partsList.appendChild(row);
    attachImageHandlers(row);
    attachRemoveHandlers(partsList); // actualizar eventos de eliminar (aunque el nuevo no tiene botón quitar porque es nuevo, pero por si acaso)
  });

  // Envío del formulario
  const form = document.getElementById('edit-form');
  const errorBox = document.getElementById('edit-error');
  const blockedBox = document.getElementById('edit-blocked');
  const saveBtn = document.getElementById('save-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    blockedBox.innerHTML = '';

    const newTitle = document.getElementById('title').value.trim();
    const imageData = editQuoteImageData;
    const partsRows = partsList.querySelectorAll('.part-row');
    const partsData = Array.from(partsRows).map((row) => ({
      id: row.dataset.partId || undefined,
      name: row.querySelector('.part-name').value.trim(),
      code: '',
      unit: '',
      description: '',
      quantity: row.querySelector('.part-quantity').value.trim() || '1',
      image: row.dataset.image || '',
    })).filter(p => p.name.length > 0);

    if (!newTitle) {
      errorBox.innerHTML = '<div class="alert-error">El título es obligatorio.</div>';
      return;
    }
    if (partsData.length === 0) {
      errorBox.innerHTML = '<div class="alert-error">Debe quedar al menos un repuesto.</div>';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';

    try {
      const res = await fetch(`/api/quote-edit?uuid=${encodeURIComponent(uuid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          image: imageData,
          parts: partsData,
          removedPartIds: removedPartIds,
        }),
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

      // Redirigir al panel después de guardar exitosamente
      window.location.href = '/admin.html';
    } catch (err) {
      errorBox.innerHTML = '<div class="alert-error">Error de conexión. Intenta de nuevo.</div>';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';
    }
  });
}

// ---------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------
async function init() {
  if (!uuid) {
    app.innerHTML = '<div class="card alert-error">Falta el identificador de la cotización.</div>';
    return;
  }

  const ok = await checkSession();
  if (!ok) return;

  try {
    const res = await fetch(`/api/quote-edit?uuid=${encodeURIComponent(uuid)}`);
    if (res.status === 401) {
      window.location.href = '/admin-login.html?next=/editar.html?uuid=' + encodeURIComponent(uuid);
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      app.innerHTML = `<div class="card alert-error">${escapeHtml(data.error || 'Error al cargar la cotización')}</div>`;
      return;
    }
    // Cargar catálogo para autocompletado
    await loadPartCatalog();
    render(data);
  } catch (err) {
    app.innerHTML = '<div class="card alert-error">Error de conexión. Intenta de nuevo.</div>';
  }
}

init();