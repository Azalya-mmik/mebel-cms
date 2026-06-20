// Leads page
let allLeads = [];

$('pageActions').innerHTML = `
  <a href="/api/leads/export" class="btn btn-ghost">📥 Экспорт CSV</a>
`;

$('content').innerHTML = `
  <div class="filter-bar">
    <input type="text" id="searchLead" placeholder="🔍 Поиск по имени/телефону..." oninput="filterLeads()">
    <select id="statusFilter" onchange="filterLeads()">
      <option value="">Все статусы</option>
      <option value="new">Новые</option>
      <option value="working">В работе</option>
      <option value="done">Выполнена</option>
      <option value="rejected">Отклонена</option>
    </select>
    <input type="date" id="fromDate" onchange="filterLeads()" title="С даты">
    <input type="date" id="toDate" onchange="filterLeads()" title="По дату">
    <button class="btn btn-ghost btn-sm" onclick="clearFilters()">✕ Сбросить</button>
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Имя</th><th>Телефон</th><th>Сообщение</th>
            <th>Статус</th><th>Дата</th><th>Действия</th>
          </tr>
        </thead>
        <tbody id="leadsBody"><tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">Загрузка...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Lead detail modal -->
  <div class="modal-overlay" id="leadModal">
    <div class="modal">
      <div class="modal-header">
        <h3>Заявка #<span id="ldId"></span></h3>
        <button class="modal-close" onclick="closeModal('leadModal')">✕</button>
      </div>
      <div class="modal-body" id="leadDetail"></div>
      <div class="modal-footer">
        <select id="ldStatus" style="width:auto;flex:1">
          <option value="new">Новая</option>
          <option value="working">В работе</option>
          <option value="done">Выполнена</option>
          <option value="rejected">Отклонена</option>
        </select>
        <button class="btn btn-primary" onclick="updateLeadStatus()">Сохранить</button>
        <button class="btn btn-danger" onclick="deleteLead()">Удалить</button>
      </div>
    </div>
  </div>
`;

async function loadLeads() {
  try {
    const data = await api('GET', '/api/leads?limit=500');
    allLeads = data.leads;
    filterLeads();
  } catch(e) {
    $('leadsBody').innerHTML = `<tr><td colspan="7" style="text-align:center;color:red">Ошибка: ${e.message}</td></tr>`;
  }
}

function filterLeads() {
  const q = $('searchLead').value.toLowerCase();
  const status = $('statusFilter').value;
  const from = $('fromDate').value;
  const to = $('toDate').value;

  const filtered = allLeads.filter(l => {
    if (q && !((l.name || '').toLowerCase().includes(q) || l.phone.includes(q))) return false;
    if (status && l.status !== status) return false;
    if (from && l.created_at.split('T')[0] < from) return false;
    if (to && l.created_at.split('T')[0] > to) return false;
    return true;
  });

  renderLeads(filtered);
}

function clearFilters() {
  $('searchLead').value = '';
  $('statusFilter').value = '';
  $('fromDate').value = '';
  $('toDate').value = '';
  filterLeads();
}

function renderLeads(leads) {
  if (!leads.length) {
    $('leadsBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">Заявок не найдено</td></tr>';
    return;
  }
  $('leadsBody').innerHTML = leads.map(l => `
    <tr style="cursor:pointer" onclick="openLead(${l.id})">
      <td style="color:var(--text-muted);font-size:12px">#${l.id}</td>
      <td><strong>${l.name || '—'}</strong></td>
      <td><a href="tel:${l.phone}" onclick="event.stopPropagation()">${l.phone}</a></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:13px">
        ${l.message || '—'}
      </td>
      <td>${badge(l.status)}</td>
      <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${fmtDate(l.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="quickStatus(${l.id},'working')">В работе</button>
          <button class="btn btn-success btn-sm" onclick="quickStatus(${l.id},'done')">✓</button>
        </div>
      </td>
    </tr>
  `).join('');
}

let currentLeadId = null;

function openLead(id) {
  const l = allLeads.find(x => x.id === id);
  if (!l) return;
  currentLeadId = id;
  $('ldId').textContent = id;
  $('ldStatus').value = l.status;
  $('leadDetail').innerHTML = `
    <div style="display:grid;gap:12px">
      <div class="form-row">
        <div><label>Имя</label><p style="font-weight:700">${l.name || '—'}</p></div>
        <div><label>Телефон</label><p><a href="tel:${l.phone}" style="font-weight:700;color:var(--accent)">${l.phone}</a></p></div>
      </div>
      <div><label>Сообщение</label><p style="background:var(--bg);padding:10px;border-radius:8px">${l.message || '—'}</p></div>
      <div class="form-row">
        <div><label>Источник</label><p>${l.source || 'site'}</p></div>
        <div><label>Дата</label><p>${fmtDate(l.created_at)}</p></div>
      </div>
    </div>
  `;
  openModal('leadModal');
}

async function updateLeadStatus() {
  try {
    await api('PUT', `/api/leads/${currentLeadId}/status`, { status: $('ldStatus').value });
    toast('Статус обновлён', 'success');
    closeModal('leadModal');
    loadLeads();
  } catch(e) { toast(e.message, 'error'); }
}

async function quickStatus(id, status) {
  try {
    await api('PUT', `/api/leads/${id}/status`, { status });
    toast('Статус обновлён', 'success');
    loadLeads();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteLead() {
  if (!confirm('Удалить заявку?')) return;
  try {
    await api('DELETE', `/api/leads/${currentLeadId}`);
    toast('Заявка удалена');
    closeModal('leadModal');
    loadLeads();
  } catch(e) { toast(e.message, 'error'); }
}

loadLeads();
