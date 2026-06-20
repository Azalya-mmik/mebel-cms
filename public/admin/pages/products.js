// Products page
let allProducts = [];
let editingId = null;

$('pageActions').innerHTML = `
  <button class="btn btn-accent" onclick="openAddModal()">+ Добавить товар</button>
`;

$('content').innerHTML = `
  <div class="filter-bar">
    <input type="text" id="searchInput" placeholder="🔍 Поиск по названию..." oninput="filterProducts()">
    <select id="catFilter" onchange="filterProducts()">
      <option value="">Все категории</option>
      <option value="beds">Кровати</option>
      <option value="sofas">Диваны</option>
      <option value="wardrobes">Шкафы</option>
      <option value="kitchen">Кухни</option>
      <option value="chairs">Стулья</option>
      <option value="other">Прочее</option>
    </select>
    <select id="statusFilter" onchange="filterProducts()">
      <option value="">Все статусы</option>
      <option value="available">В наличии</option>
      <option value="order">Под заказ</option>
      <option value="hidden">Скрыт</option>
    </select>
  </div>
  <div class="products-grid" id="productsGrid"><div class="loader">Загрузка...</div></div>

  <!-- Add/Edit Modal -->
  <div class="modal-overlay" id="productModal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="modalTitle">Добавить товар</h3>
        <button class="modal-close" onclick="closeModal('productModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Фото товара</label>
          <div class="upload-area" onclick="document.getElementById('imgFile').click()">
            <input type="file" id="imgFile" accept="image/*" onchange="previewImg(this)">
            <div id="imgPreview"><div class="upload-icon">📷</div><p>Нажмите для загрузки (JPG/PNG/WEBP)</p></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Название *</label>
            <input type="text" id="pName" placeholder="Кровать двуспальная">
          </div>
          <div class="form-group">
            <label>Цена (₽)</label>
            <input type="number" id="pPrice" placeholder="35000">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Категория</label>
            <select id="pCategory">
              <option value="beds">Кровати</option>
              <option value="sofas">Диваны</option>
              <option value="wardrobes">Шкафы</option>
              <option value="kitchen">Кухни</option>
              <option value="chairs">Стулья</option>
              <option value="other">Прочее</option>
            </select>
          </div>
          <div class="form-group">
            <label>Статус</label>
            <select id="pStatus">
              <option value="available">В наличии</option>
              <option value="order">Под заказ</option>
              <option value="hidden">Скрыт</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Описание</label>
          <textarea id="pDesc" placeholder="Описание товара..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('productModal')">Отмена</button>
        <button class="btn btn-primary" onclick="saveProduct()">💾 Сохранить</button>
      </div>
    </div>
  </div>

  <!-- Image upload modal -->
  <div class="modal-overlay" id="imgModal">
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><h3>Загрузить фото</h3><button class="modal-close" onclick="closeModal('imgModal')">✕</button></div>
      <div class="modal-body">
        <div class="upload-area" onclick="document.getElementById('imgFile2').click()">
          <input type="file" id="imgFile2" accept="image/*">
          <div class="upload-icon">📷</div>
          <p>Нажмите для выбора файла</p>
        </div>
        <input type="hidden" id="imgProductId">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('imgModal')">Отмена</button>
        <button class="btn btn-primary" onclick="uploadProductImage()">Загрузить</button>
      </div>
    </div>
  </div>
`;

const CAT_NAMES = { beds: 'Кровати', sofas: 'Диваны', wardrobes: 'Шкафы', kitchen: 'Кухни', chairs: 'Стулья', other: 'Прочее' };

async function loadProducts() {
  try {
    allProducts = await api('GET', '/api/products');
    filterProducts();
  } catch(e) {
    $('productsGrid').innerHTML = `<div class="empty-state"><p>Ошибка: ${e.message}</p></div>`;
  }
}

function filterProducts() {
  const q = $('searchInput').value.toLowerCase();
  const cat = $('catFilter').value;
  const status = $('statusFilter').value;
  const filtered = allProducts.filter(p =>
    (!q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) &&
    (!cat || p.category === cat) &&
    (!status || p.status === status)
  );
  renderProducts(filtered);
}

function renderProducts(products) {
  if (!products.length) {
    $('productsGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🛋️</div><p>Товаров не найдено</p></div>';
    return;
  }
  $('productsGrid').innerHTML = products.map(p => `
    <div class="product-card">
      <div class="product-img" onclick="openImgModal(${p.id})">
        ${p.image ? `<img src="${p.image}" alt="${p.name}">` : '<div class="no-img">🪑</div>'}
        <div style="position:absolute;bottom:6px;right:6px;background:#0007;color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">📷 Заменить</div>
      </div>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div>${badge(p.status)} <span style="font-size:12px;color:var(--text-muted)">${CAT_NAMES[p.category] || p.category}</span></div>
        <div class="product-price">${p.price > 0 ? fmtPrice(p.price) : 'По запросу'}</div>
        ${p.description ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.4">${p.description.substring(0, 80)}${p.description.length > 80 ? '…' : ''}</div>` : ''}
      </div>
      <div class="product-actions">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="editProduct(${p.id})">✏️ Изменить</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openAddModal() {
  editingId = null;
  $('modalTitle').textContent = 'Добавить товар';
  $('pName').value = '';
  $('pPrice').value = '';
  $('pDesc').value = '';
  $('pCategory').value = 'beds';
  $('pStatus').value = 'available';
  $('imgPreview').innerHTML = '<div class="upload-icon">📷</div><p>Нажмите для загрузки</p>';
  openModal('productModal');
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  editingId = id;
  $('modalTitle').textContent = 'Редактировать товар';
  $('pName').value = p.name;
  $('pPrice').value = p.price;
  $('pDesc').value = p.description || '';
  $('pCategory').value = p.category;
  $('pStatus').value = p.status;
  $('imgPreview').innerHTML = p.image
    ? `<img src="${p.image}" style="max-height:120px;border-radius:8px">`
    : '<div class="upload-icon">📷</div><p>Нажмите для загрузки</p>';
  openModal('productModal');
}

async function saveProduct() {
  const name = $('pName').value.trim();
  if (!name) { toast('Введите название', 'error'); return; }
  const data = { name, price: $('pPrice').value, description: $('pDesc').value, category: $('pCategory').value, status: $('pStatus').value };

  try {
    if (editingId) {
      await api('PUT', `/api/products/${editingId}`, data);
      // Upload image if selected
      const file = $('imgFile').files[0];
      if (file) await uploadImg(editingId, file);
      toast('Товар обновлён', 'success');
    } else {
      const res = await api('POST', '/api/products', data);
      const file = $('imgFile').files[0];
      if (file && res.id) await uploadImg(res.id, file);
      toast('Товар добавлен', 'success');
    }
    closeModal('productModal');
    loadProducts();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function uploadImg(id, file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`/api/products/${id}/image`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Ошибка загрузки фото');
}

function previewImg(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    $('imgPreview').innerHTML = `<img src="${e.target.result}" style="max-height:120px;border-radius:8px">`;
  };
  reader.readAsDataURL(input.files[0]);
}

function openImgModal(id) {
  $('imgProductId').value = id;
  $('imgFile2').value = '';
  openModal('imgModal');
}

async function uploadProductImage() {
  const id = $('imgProductId').value;
  const file = $('imgFile2').files[0];
  if (!file) { toast('Выберите файл', 'error'); return; }
  try {
    await uploadImg(id, file);
    toast('Фото загружено', 'success');
    closeModal('imgModal');
    loadProducts();
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Удалить товар?')) return;
  try {
    await api('DELETE', `/api/products/${id}`);
    toast('Товар удалён');
    loadProducts();
  } catch(e) {
    toast(e.message, 'error');
  }
}

loadProducts();
