// SEO page
$('content').innerHTML = `
  <div class="card" style="margin-bottom:16px">
    <div class="card-header">Редактор SEO-метатегов</div>
    <div class="card-body">
      <div class="form-group">
        <label>Страница</label>
        <select id="seoPage" onchange="loadSeoPage()">
          <option value="/">Главная (/)</option>
          <option value="/catalog">Каталог (/catalog)</option>
          <option value="/beds">Кровати (/beds)</option>
          <option value="/sofas">Диваны (/sofas)</option>
          <option value="/wardrobes">Шкафы (/wardrobes)</option>
          <option value="/kitchen">Кухни (/kitchen)</option>
          <option value="/portfolio">Портфолио (/portfolio)</option>
          <option value="/contacts">Контакты (/contacts)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Title (заголовок страницы)</label>
        <input type="text" id="seoTitle" placeholder="Мебель на заказ — купить диван в Казани" maxlength="70">
        <div id="seoTitleLen" style="font-size:11px;color:var(--text-muted);margin-top:3px">0/70 символов</div>
      </div>
      <div class="form-group">
        <label>Description (описание для поисковиков)</label>
        <textarea id="seoDesc" placeholder="Изготовим мебель на заказ по вашим размерам..." maxlength="160" style="min-height:80px"></textarea>
        <div id="seoDescLen" style="font-size:11px;color:var(--text-muted);margin-top:3px">0/160 символов</div>
      </div>
      <div class="form-group">
        <label>Keywords (через запятую)</label>
        <input type="text" id="seoKeywords" placeholder="мебель на заказ казань, купить диван казань">
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" onclick="saveSeo()">💾 Сохранить</button>
        <div id="seoPreview" style="flex:1;font-size:12px;color:var(--text-muted)"></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">📋 Все настроенные страницы</div>
    <div class="table-wrap" id="seoTable"><div class="loader">Загрузка...</div></div>
  </div>
`;

let seoData = [];

// Counter
$('seoTitle').addEventListener('input', function() {
  $('seoTitleLen').textContent = `${this.value.length}/70 символов`;
  $('seoTitleLen').style.color = this.value.length > 60 ? 'var(--accent)' : 'var(--text-muted)';
  updatePreview();
});
$('seoDesc').addEventListener('input', function() {
  $('seoDescLen').textContent = `${this.value.length}/160 символов`;
  $('seoDesc').style.color = this.value.length > 150 ? 'var(--accent)' : 'var(--text-muted)';
  updatePreview();
});

function updatePreview() {
  const title = $('seoTitle').value;
  const desc = $('seoDesc').value;
  if (title) {
    $('seoPreview').innerHTML = `<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:8px">
      <div style="color:#1558d6;font-size:14px">${title}</div>
      <div style="color:#006621;font-size:12px">site.ru${$('seoPage').value}</div>
      <div style="color:#545454;font-size:13px">${desc}</div>
    </div>`;
  }
}

async function loadSeoData() {
  seoData = await api('GET', '/api/seo');
  renderSeoTable();
}

function loadSeoPage() {
  const page = $('seoPage').value;
  const found = seoData.find(s => s.page === page);
  $('seoTitle').value = found?.title || '';
  $('seoDesc').value = found?.description || '';
  $('seoKeywords').value = found?.keywords || '';
  $('seoTitleLen').textContent = `${(found?.title || '').length}/70 символов`;
  $('seoDescLen').textContent = `${(found?.description || '').length}/160 символов`;
  updatePreview();
}

function renderSeoTable() {
  if (!seoData.length) {
    $('seoTable').innerHTML = '<div class="empty-state" style="padding:30px"><p>Нет настроенных страниц</p></div>';
    return;
  }
  $('seoTable').innerHTML = `
    <table>
      <thead><tr><th>Страница</th><th>Title</th><th>Description</th><th>Обновлено</th></tr></thead>
      <tbody>${seoData.map(s => `
        <tr onclick="selectPage('${s.page}')" style="cursor:pointer">
          <td><code>${s.page}</code></td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.title || '—'}</td>
          <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">${s.description || '—'}</td>
          <td style="font-size:12px;color:var(--text-muted)">${fmtDate(s.updated_at)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

window.selectPage = function(page) {
  $('seoPage').value = page;
  loadSeoPage();
  $('seoPage').scrollIntoView({ behavior: 'smooth' });
};

async function saveSeo() {
  try {
    await api('POST', '/api/seo', {
      page: $('seoPage').value,
      title: $('seoTitle').value,
      description: $('seoDesc').value,
      keywords: $('seoKeywords').value
    });
    toast('SEO сохранён', 'success');
    loadSeoData();
  } catch(e) { toast(e.message, 'error'); }
}

loadSeoData();
