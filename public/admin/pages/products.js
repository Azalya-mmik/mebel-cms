// Каталог товаров R&T
let allProducts = [];
let CATS = [];
let editingId = null;
let editingImages = [];      // фото уже сохранённого товара (URL с сервера)
let pendingFiles = [];       // фото для нового товара, ещё не сохранённого (File)
let pendingPreviews = [];    // локальные превью для pendingFiles (data URL)
const ST = { available: 'В наличии', order: 'Нет в наличии', hidden: 'Скрыт' };

$('pageActions').innerHTML = `
  <button class="btn btn-accent" onclick="openAddModal()">+ Добавить товар</button>
`;

async function initProductsPage() {
  try {
    const cats = await api('GET', '/api/categories');
    CATS = cats.map(c => c.name);
  } catch (e) {
    CATS = ['Прочее']; // на случай сбоя API — форма всё равно останется рабочей
  }

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
          <label>Фото товара — можно несколько, первое считается главным (показывается в каталоге)</label>
          <div id="photoGallery" style="display:flex;flex-wrap:wrap;margin-bottom:8px"></div>
          <div class="upload-area" onclick="document.getElementById('imgFile').click()">
            <input type="file" id="imgFile" accept="image/*" multiple onchange="handlePhotoSelect(this)">
            <div class="upload-icon">📷</div><p>Нажмите, чтобы добавить фото (можно выбрать сразу несколько, JPG/PNG/WEBP)</p>
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
            <label>Категория ${CATS.length ? '' : '<span style="color:#e53e3e">(сначала создайте категорию)</span>'}</label>
            <select id="pCategory">${CATS.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
            <a href="/admin/categories" style="font-size:12px;display:inline-block;margin-top:4px">+ Новая категория</a>
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
`;

  loadProducts();
}

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
      <div class="product-img" onclick="editProduct(${p.id})">
        ${img ? `<img src="${img}" alt="${p.name}">` : '<div class="no-img">🪑</div>'}
        <div style="position:absolute;bottom:6px;right:6px;background:#0007;color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">✏️ Фото (${parseList(p.images).length || (img ? 1 : 0)})</div>
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
  $('pCategory').value = CATS[0] || '';
  $('pStatus').value = 'available';
  editingImages = [];
  pendingFiles = [];
  pendingPreviews = [];
  renderGallery();
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
  if (p.category && !CATS.includes(p.category)) {
    $('pCategory').insertAdjacentHTML('afterbegin', `<option value="${p.category}">${p.category} (нет в списке)</option>`);
  }
  $('pCategory').value = p.category || CATS[0] || '';
  $('pStatus').value = p.status;
  editingImages = parseList(p.images);
  if (!editingImages.length && p.image) editingImages = [p.image];
  pendingFiles = [];
  pendingPreviews = [];
  renderGallery();
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
      toast('Товар обновлён', 'success');
    } else {
      const res = await api('POST', '/api/products', data);
      if (pendingFiles.length && res.id) await uploadFiles(res.id, pendingFiles);
      toast('Товар добавлен', 'success');
    }
    closeModal('productModal');
    loadProducts();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function uploadFiles(id, files) {
  const fd = new FormData();
  files.forEach(f => fd.append('image', f));
  const res = await fetch(`/api/products/${id}/image`, { method: 'POST', body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Ошибка загрузки фото');
  return json.images || [];
}

function fileToDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}

async function handlePhotoSelect(input) {
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  if (editingId) {
    try {
      editingImages = await uploadFiles(editingId, files);
      renderGallery();
      toast('Фото добавлено', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  } else {
    for (const f of files) {
      pendingFiles.push(f);
      pendingPreviews.push(await fileToDataUrl(f));
    }
    renderGallery();
  }
}

function photoThumb(src, isMain, onMain, onRemove) {
  return `<div style="position:relative;margin:0 8px 8px 0">
    <img src="${src}" style="width:88px;height:88px;object-fit:cover;border-radius:8px;border:${isMain ? '3px solid #276749' : '1px solid var(--border,#ddd)'}">
    ${isMain ? '<div style="position:absolute;top:3px;left:3px;background:#276749;color:#fff;font-size:10px;padding:1px 6px;border-radius:6px">Главное</div>' : ''}
    <div style="display:flex;gap:4px;margin-top:4px">
      ${isMain ? '' : `<button type="button" class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:11px" onclick="${onMain}">★ Главное</button>`}
      <button type="button" class="btn btn-danger btn-sm" style="padding:2px 7px;font-size:11px" onclick="${onRemove}">✕</button>
    </div>
  </div>`;
}

function renderGallery() {
  const box = $('photoGallery');
  if (!box) return;
  if (editingId) {
    box.innerHTML = editingImages.length
      ? editingImages.map((url, i) => photoThumb(url, i === 0, `makeMainPhoto(${i})`, `removePhoto(${i})`)).join('')
      : '<p style="color:var(--text-muted);font-size:13px">Фото пока нет</p>';
  } else {
    box.innerHTML = pendingPreviews.length
      ? pendingPreviews.map((src, i) => photoThumb(src, i === 0, `makeMainPending(${i})`, `removePending(${i})`)).join('')
      : '<p style="color:var(--text-muted);font-size:13px">Фото добавятся после сохранения товара</p>';
  }
}

async function removePhoto(i) {
  const newArr = editingImages.filter((_, idx) => idx !== i);
  try {
    await api('PUT', `/api/products/${editingId}/images`, { images: newArr });
    editingImages = newArr;
    renderGallery();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function makeMainPhoto(i) {
  const arr = editingImages.slice();
  const [item] = arr.splice(i, 1);
  arr.unshift(item);
  try {
    await api('PUT', `/api/products/${editingId}/images`, { images: arr });
    editingImages = arr;
    renderGallery();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function removePending(i) {
  pendingFiles.splice(i, 1);
  pendingPreviews.splice(i, 1);
  renderGallery();
}

function makeMainPending(i) {
  const [f] = pendingFiles.splice(i, 1); pendingFiles.unshift(f);
  const [p] = pendingPreviews.splice(i, 1); pendingPreviews.unshift(p);
  renderGallery();
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

initProductsPage();
