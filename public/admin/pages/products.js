// Каталог товаров R&T
let allProducts = [];
let editingId = null;

const CATS = ['Табуреты', 'Стулья', 'Банкетки', 'Прочее'];
const ST = { available: 'В наличии', order: 'Нет в наличии', hidden: 'Скрыт' };

$('pageActions').innerHTML = `
  <button class="btn btn-accent" onclick="openAddModal()">+ Добавить товар</button>
`;

$('content').innerHTML = `
  <div class="filter-bar">
    <input type="text" id="searchInput" placeholder="🔍 Поиск по названию..." oninput="filterProducts()">
    <select id="catFilter" onchange="filterProducts()">
      <option value="">Все категории</option>
      ${CATS.map(c => `<option value="${c}">${c}</option>`).join('')}
    </select>
    <select id="statusFilter" onchange="filterProducts()">
      <option value="">Все статусы</option>
      <option value="available">В наличии</option>
      <option value="order">Нет в наличии</option>
      <option value="hidden">Скрыт</option>
    </select>
  </div>
  <div class="products-grid" id="productsGrid"><div class="loader">Загрузка...</div></div>

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
            <input type="text" id="pName" placeholder="Табурет Рио">
          </div>
          <div class="form-group">
            <label>Цена (₽)</label>
            <input type="number" id="pPrice" placeholder="1200">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Категория</label>
            <select id="pCategory">${CATS.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label>Наличие</label>
            <select id="pStatus">
              <option value="available">В наличии</option>
              <option value="order">Нет в наличии</option>
              <option value="hidden">Скрыт (не виден на сайте)</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Цена с поворотным механизмом (₽) — если есть, иначе пусто</label>
          <input type="number" id="pCostRot" placeholder="напр. 1800">
        </div>
        <div class="form-group">
          <label>Характеристики — каждая с новой строки</label>
          <textarea id="pSpecs" rows="4" placeholder="Высота: 45 см&#10;Материал: берёзовая фанера&#10;Нагрузка: до 120 кг"></textarea>
        </div>
        <div class="form-group">
          <label>Цвета — каждый с новой строки</label>
          <textarea id="pColors" rows="3" placeholder="Дуб&#10;Венге&#10;Белый"></textarea>
        </div>
        <div class="form-group">
          <label>Описание (необязательно)</label>
          <textarea id="pDesc" rows="2" placeholder="Короткое описание..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('productModal')">Отмена</button>
        <button class="btn btn-primary" onclick="saveProduct()">💾 Сохранить</button>
      </div>
    </div>
  </div>

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

function parseList(v) { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function firstImg(p) {
  const imgs = parseList(p.images);
  return (imgs.length ? imgs[0] : (p.image || ''));
}
function stBadge(s) {
  const color = s === 'available' ? '#276749' : s === 'order' ? '#b7791f' : '#718096';
  return `<span style="background:${color};color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">${ST[s] || s}</span>`;
}

async function loadProducts() {
  try {
    allProducts = await api('GET', '/api/products');
    filterProducts();
  } catch (e) {
    $('productsGrid').innerHTML = `<div class="empty-state"><p>Ошибка: ${e.message}</p></div>`;
  }
}

function filterProducts() {
  const q = $('searchInput').value.toLowerCase();
  const cat = $('catFilter').value;
  const status = $('statusFilter').value;
  const filtered = allProducts.filter(p =>
    (!q || p.name.toLowerCase().includes(q)) &&
    (!cat || p.category === cat) &&
    (!status || p.status === status)
  );
  renderProducts(filtered);
}

function renderProducts(products) {
  if (!products.length) {
    $('productsGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🪑</div><p>Товаров не найдено</p></div>';
    return;
  }
  $('productsGrid').innerHTML = products.map(p => {
    const img = firstImg(p);
    return `
    <div class="product-card">
      <div class="product-img" onclick="openImgModal(${p.id})">
        ${img ? `<img src="${img}" alt="${p.name}">` : '<div class="no-img">🪑</div>'}
        <div style="position:absolute;bottom:6px;right:6px;background:#0007;color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">📷 Заменить</div>
      </div>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div>${stBadge(p.status)} <span style="font-size:12px;color:var(--text-muted)">${p.category || ''}</span></div>
        <div class="product-price">${p.price > 0 ? fmtPrice(p.price) : 'По запросу'}</div>
      </div>
      <div class="product-actions">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="editProduct(${p.id})">✏️ Изменить</button>
        <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function openAddModal() {
  editingId = null;
  $('modalTitle').textContent = 'Добавить товар';
  $('pName').value = '';
  $('pPrice').value = '';
  $('pCostRot').value = '';
  $('pSpecs').value = '';
  $('pColors').value = '';
  $('pDesc').value = '';
  $('pCategory').value = 'Табуреты';
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
  $('pCostRot').value = (p.cost_rot != null ? p.cost_rot : '');
  $('pSpecs').value = parseList(p.specs).join('\n');
  $('pColors').value = parseList(p.colors).join('\n');
  $('pDesc').value = p.description || '';
  $('pCategory').value = CATS.includes(p.category) ? p.category : 'Прочее';
  $('pStatus').value = p.status;
  const img = firstImg(p);
  $('imgPreview').innerHTML = img
    ? `<img src="${img}" style="max-height:120px;border-radius:8px">`
    : '<div class="upload-icon">📷</div><p>Нажмите для загрузки</p>';
  openModal('productModal');
}

async function saveProduct() {
  const name = $('pName').value.trim();
  if (!name) { toast('Введите название', 'error'); return; }
  const data = {
    name,
    price: $('pPrice').value,
    cost_rot: $('pCostRot').value,
    description: $('pDesc').value,
    category: $('pCategory').value,
    status: $('pStatus').value,
    specs: $('pSpecs').value,
    colors: $('pColors').value,
  };
  try {
    if (editingId) {
      await api('PUT', `/api/products/${editingId}`, data);
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
  } catch (e) {
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
  reader.onload = e => { $('imgPreview').innerHTML = `<img src="${e.target.result}" style="max-height:120px;border-radius:8px">`; };
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
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('Удалить товар?')) return;
  try {
    await api('DELETE', `/api/products/${id}`);
    toast('Товар удалён');
    loadProducts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

loadProducts();
