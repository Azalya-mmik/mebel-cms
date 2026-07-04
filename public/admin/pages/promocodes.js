// Промокоды партнёров
let allPromos = [];
let editingPromoId = null;

$('pageActions').innerHTML = `
  <button class="btn btn-accent" onclick="openAddPromoModal()">+ Добавить промокод</button>
`;

$('content').innerHTML = `
  <p style="color:var(--text-muted);font-size:13.5px;margin:0 0 16px;max-width:680px">
    Каждому партнёру (блогеру, знакомому, смежному бизнесу) можно выдать свой уникальный код со скидкой.
    Клиент вводит код при оформлении заявки на сайте — скидка применяется автоматически,
    а здесь видно, сколько раз каждый код использовали.
  </p>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Код</th><th>Партнёр</th><th>Скидка</th><th>Статус</th>
            <th>Использований</th><th>Создан</th><th>Действия</th>
          </tr>
        </thead>
        <tbody id="promoBody"><tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">Загрузка...</td></tr></tbody>
      </table>
    </div>
  </div>

  <div class="modal-overlay" id="promoModal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="promoModalTitle">Добавить промокод</h3>
        <button class="modal-close" onclick="closeModal('promoModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Код *</label>
          <input type="text" id="promoCode" placeholder="Например: MARAT10" style="text-transform:uppercase">
          <p style="color:var(--text-muted);font-size:12px;margin:4px 0 0">Регистр не важен — клиент может ввести как угодно.</p>
        </div>
        <div class="form-group">
          <label>Партнёр</label>
          <input type="text" id="promoPartner" placeholder="Например: Ирина (блогер), сосед Артём...">
        </div>
        <div class="form-group">
          <label>Скидка, % *</label>
          <input type="number" id="promoPercent" placeholder="напр. 10" min="1" max="100">
        </div>
        <div class="form-group" id="promoActiveGroup" style="display:none">
          <label>Показывать / принимать на сайте</label>
          <select id="promoActive">
            <option value="1">Да, активен</option>
            <option value="0">Нет, выключен</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('promoModal')">Отмена</button>
        <button class="btn btn-primary" onclick="savePromo()">💾 Сохранить</button>
      </div>
    </div>
  </div>
`;

async function loadPromos() {
  try {
    allPromos = await api('GET', '/api/promocodes');
    renderPromos();
  } catch (e) {
    $('promoBody').innerHTML = `<tr><td colspan="7" style="text-align:center;color:red">Ошибка: ${e.message}</td></tr>`;
  }
}

function renderPromos() {
  if (!allPromos.length) {
    $('promoBody').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">Промокодов пока нет — добавьте первый для партнёра</td></tr>`;
    return;
  }
  $('promoBody').innerHTML = allPromos.map(p => `
    <tr>
      <td><b>${p.code}</b></td>
      <td>${p.partner_name || '—'}</td>
      <td>${p.discount_percent}%</td>
      <td>${p.active
        ? '<span style="background:#276749;color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">Активен</span>'
        : '<span style="background:#718096;color:#fff;font-size:11px;padding:2px 8px;border-radius:6px">Выключен</span>'}</td>
      <td>${p.uses_count}</td>
      <td>${new Date(p.created_at).toLocaleDateString('ru-RU')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="togglePromo(${p.id})">${p.active ? '⏸ Выключить' : '▶️ Включить'}</button>
        <button class="btn btn-ghost btn-sm" onclick="editPromo(${p.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deletePromo(${p.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function openAddPromoModal() {
  editingPromoId = null;
  $('promoModalTitle').textContent = 'Добавить промокод';
  $('promoCode').value = '';
  $('promoCode').disabled = false;
  $('promoPartner').value = '';
  $('promoPercent').value = '';
  $('promoActiveGroup').style.display = 'none';
  openModal('promoModal');
}

function editPromo(id) {
  const p = allPromos.find(x => x.id === id);
  if (!p) return;
  editingPromoId = id;
  $('promoModalTitle').textContent = 'Редактировать промокод';
  $('promoCode').value = p.code;
  $('promoCode').disabled = true; // код — как идентификатор, менять его после раздачи партнёру не стоит
  $('promoPartner').value = p.partner_name || '';
  $('promoPercent').value = p.discount_percent;
  $('promoActiveGroup').style.display = '';
  $('promoActive').value = String(p.active);
  openModal('promoModal');
}

async function savePromo() {
  const code = $('promoCode').value.trim();
  const partner_name = $('promoPartner').value.trim();
  const discount_percent = $('promoPercent').value;
  if (!code) { toast('Введите код', 'error'); return; }
  if (!discount_percent || discount_percent < 1 || discount_percent > 100) {
    toast('Скидка должна быть от 1 до 100%', 'error'); return;
  }
  try {
    if (editingPromoId) {
      await api('PUT', `/api/promocodes/${editingPromoId}`, {
        partner_name, discount_percent,
        active: $('promoActive').value === '1',
      });
      toast('Промокод обновлён', 'success');
    } else {
      await api('POST', '/api/promocodes', { code, partner_name, discount_percent });
      toast('Промокод добавлен', 'success');
    }
    closeModal('promoModal');
    loadPromos();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function togglePromo(id) {
  const p = allPromos.find(x => x.id === id);
  if (!p) return;
  try {
    await api('PUT', `/api/promocodes/${id}`, {
      partner_name: p.partner_name, discount_percent: p.discount_percent, active: !p.active,
    });
    toast(p.active ? 'Промокод выключен' : 'Промокод включён', 'success');
    loadPromos();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deletePromo(id) {
  const p = allPromos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Удалить промокод «${p.code}»? Статистика по уже оформленным заявкам сохранится, но код станет недоступен на сайте.`)) return;
  try {
    await api('DELETE', `/api/promocodes/${id}`);
    toast('Промокод удалён');
    loadPromos();
  } catch (e) {
    toast(e.message, 'error');
  }
}

loadPromos();
