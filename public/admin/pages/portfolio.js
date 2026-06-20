// Portfolio page
$('pageActions').innerHTML = `<button class="btn btn-accent" onclick="openModal('addPortModal')">+ Добавить работу</button>`;

$('content').innerHTML = `
  <div class="portfolio-grid" id="portfolioGrid"><div class="loader" style="grid-column:1/-1">Загрузка...</div></div>

  <div class="modal-overlay" id="addPortModal">
    <div class="modal" style="max-width:460px">
      <div class="modal-header"><h3>Добавить работу</h3><button class="modal-close" onclick="closeModal('addPortModal')">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Фото *</label>
          <div class="upload-area" onclick="$('portFile').click()">
            <input type="file" id="portFile" accept="image/*" onchange="previewPort(this)">
            <div id="portPreview"><div class="upload-icon">🖼️</div><p>Нажмите для выбора</p></div>
          </div>
        </div>
        <div class="form-group"><label>Название</label><input type="text" id="portTitle" placeholder="Кухня в стиле модерн"></div>
        <div class="form-group"><label>Описание</label><textarea id="portDesc" placeholder="Короткое описание работы..."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('addPortModal')">Отмена</button>
        <button class="btn btn-primary" onclick="addPortItem()">Добавить</button>
      </div>
    </div>
  </div>
`;

function previewPort(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => { $('portPreview').innerHTML = `<img src="${e.target.result}" style="max-height:150px;border-radius:8px">`; };
  reader.readAsDataURL(input.files[0]);
}

async function loadPortfolio() {
  try {
    const items = await api('GET', '/api/portfolio');
    if (!items.length) {
      $('portfolioGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🖼️</div><p>Нет работ в портфолио</p></div>';
      return;
    }
    $('portfolioGrid').innerHTML = items.map(item => `
      <div class="portfolio-item">
        <img src="${item.image}" alt="${item.title}" title="${item.title}">
        <button class="del-btn" onclick="delPort(${item.id})">✕</button>
        <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,#0008);padding:8px;color:#fff;font-size:12px;font-weight:700">${item.title}</div>
      </div>`).join('');
  } catch(e) {
    $('portfolioGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Ошибка: ${e.message}</p></div>`;
  }
}

async function addPortItem() {
  const file = $('portFile').files[0];
  if (!file) { toast('Выберите фото', 'error'); return; }
  const fd = new FormData();
  fd.append('image', file);
  fd.append('title', $('portTitle').value || 'Работа');
  fd.append('description', $('portDesc').value || '');
  try {
    await fetch('/api/portfolio', { method: 'POST', body: fd });
    toast('Добавлено в портфолио', 'success');
    closeModal('addPortModal');
    loadPortfolio();
  } catch(e) { toast(e.message, 'error'); }
}

async function delPort(id) {
  if (!confirm('Удалить работу?')) return;
  await api('DELETE', `/api/portfolio/${id}`);
  toast('Удалено');
  loadPortfolio();
}

window.delPort = delPort;
loadPortfolio();
