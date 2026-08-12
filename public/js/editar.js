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
        <span class="label" style="margin-bottom: 8px; display: block;">Repuestos</span>
        <div id="parts-list">
          ${data.parts.map(partRowHtml).join('')}
        </div>
        <!-- Botón movido debajo de la lista -->
        <div style="margin-top: 12px; text-align: left;">
          <button type="button" id="add-part-btn" class="btn-secondary">+ Agregar repuesto</button>
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
      code: '',
      unit: '',
      description: '',
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