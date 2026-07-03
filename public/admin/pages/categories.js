// Категории каталога R&T
let allCategories = [];
let editingCatId = null;

$('pageActions').innerHTML = `
  <button class="btn btn-accent" onclick="openAddCatModal()">+ Добавить категорию</button>
`;

$('content').innerHTML = `
  <p style="color:var(--text-muted);font-size:13.5px;margin:0 0 16px;max-width:640px">
    Категории — это разделы каталога («Стулья», «Табуреты» и т.п.). Каждая новая категория автоматически
    появляется на сайте отдельной плиткой на главной и своей витриной товаров — без правок кода.
  </p>
  <div class="products-grid" id="categoriesGrid"><div class="loader">Загрузка...</div></div>

  <div class="modal-overlay" id="categoryModal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="catModalTitle">Добавить категорию</h3>
        <button class="modal-close" onclick="closeModal('categoryModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Обложка категории</label>
          <div class="upload-area" onclick="document.getElementById('catImgFile').click()">
            <input type="file" id="catImgFile" accept="image/*" onchange="previewCatImg(this)">
            <div id="catImgPreview"><div class="upload-icon">🗂️</div><p>Нажмите для загрузки (JPG/PNG/WEBP)</p></div>
          </div>
        </div>
        <div class="form-group">
          <label>Название категории *</label>
          <input type="text" id="catName" placeholder="Например: Тумбы прикроватные">
        </div>
        <div class="form-group">
          <label>Показывать на сайте</label>
          <select id="catActive">
            <option value="1">Да, показывать</option>
            <option value="0">Нет, скрыть</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('categoryModal')">Отмена</button>
        <button class="btn btn-primary" onclick="saveCategory()">💾 Сохранить</button>
      </div>
    </div>
  </div>
`;

async function loadCategories() {
  try {
    allCategories = await api('GET', '/api/categories');
    renderCategories();
  } catch (e) {
    $('categoriesGrid').innerHTML = `<div class="empty-state"><p>Ошибка: ${e.message}</p></div>`;
  }
}

function renderCategories() {
  if (!allCategories.length) {
    $('categoriesGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🗂️</div><p>Категорий пока нет</p></div>';
    return;
  }
  $('categoriesGrid').innerHTML = allCategories.map((c, i) => `
    <div class="product-card">
      <div class="product-img">
        ${c.cover_image ? `<img src="${c.cover_image}" alt="${c.name}">` : '<div class="no-img">🗂️</div>'}
      </div>
      <div class="product-body">
        <div class="product-name">${c.name}</div>
        <div>${c.active ? '<span style="background:#276749;color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">Показана на сайте</span>' : '<span style="background:#718096;color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">Скрыта</span>'}</div>
      </div>
      <div class="product-actions">
        <button class="btn btn-ghost btn-sm" title="Выше" ${i === 0 ? 'disabled' : ''} onclick="moveCategory(${c.id},-1)">↑</button>
        <button class="btn btn-ghost btn-sm" title="Ниже" ${i === allCategories.length - 1 ? 'disabled' : ''} onclick="moveCategory(${c.id},1)">↓</button>
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="editCategory(${c.id})">✏️ Изменить</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCategory(${c.id})">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openAddCatModal() {
  editingCatId = null;
  $('catModalTitle').textContent = 'Добавить категорию';
  $('catName').value = '';
  $('catActive').value = '1';
  $('catImgFile').value = '';
  $('catImgPreview').innerHTML = '<div class="upload-icon">🗂️</div><p>Нажмите для загрузки</p>';
  openModal('categoryModal');
}

function editCategory(id) {
  const c = allCategories.find(x => x.id === id);
  if (!c) return;
  editingCatId = id;
  $('catModalTitle').textContent = 'Редактировать категорию';
  $('catName').value = c.name;
  $('catActive').value = String(c.active);
  $('catImgFile').value = '';
  $('catImgPreview').innerHTML = c.cover_image
    ? `<img src="${c.cover_image}" style="max-height:120px;border-radius:8px">`
    : '<div class="upload-icon">🗂️</div><p>Нажмите для загрузки</p>';
  openModal('categoryModal');
}

async function saveCategory() {
  const name = $('catName').value.trim();
  if (!name) { toast('Введите название', 'error'); return; }
  const data = { name, active: $('catActive').value === '1' };
  try {
    let id = editingCatId;
    if (editingCatId) {
      const existing = allCategories.find(x => x.id === editingCatId);
      await api('PUT', `/api/categories/${editingCatId}`, { ...data, sort_order: existing ? existing.sort_order : 0 });
      toast('Категория обновлена', 'success');
    } else {
      const res = await api('POST', '/api/categories', { name, sort_order: allCategories.length });
      id = res.id;
      toast('Категория добавлена', 'success');
    }
    const file = $('catImgFile').files[0];
    if (file && id) await uploadCatImg(id, file);
    closeModal('categoryModal');
    loadCategories();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function uploadCatImg(id, file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`/api/categories/${id}/image`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Ошибка загрузки обложки');
}

function previewCatImg(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => { $('catImgPreview').innerHTML = `<img src="${e.target.result}" style="max-height:120px;border-radius:8px">`; };
  reader.readAsDataURL(input.files[0]);
}

async function moveCategory(id, dir) {
  const idx = allCategories.findIndex(x => x.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= allCategories.length) return;
  const a = allCategories[idx], b = allCategories[swapIdx];
  try {
    await api('PUT', `/api/categories/${a.id}`, { name: a.name, active: !!a.active, sort_order: b.sort_order });
    await api('PUT', `/api/categories/${b.id}`, { name: b.name, active: !!b.active, sort_order: a.sort_order });
    loadCategories();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteCategory(id) {
  if (!confirm('Удалить категорию? Это возможно только если в ней нет товаров.')) return;
  try {
    await api('DELETE', `/api/categories/${id}`);
    toast('Категория удалена');
    loadCategories();
  } catch (e) {
    toast(e.message, 'error');
  }
}

loadCategories();
