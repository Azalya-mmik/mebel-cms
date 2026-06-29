// Страница «Партнёры / Промокоды»
(function () {
  const content = $('content');
  const actions = $('pageActions');

  actions.innerHTML = `<button class="btn btn-accent" onclick="openCreateModal()">➕ Добавить промокод</button>`;

  let promos = [];

  async function load() {
    content.innerHTML = '<div class="loader">Загрузка...</div>';
    try {
      promos = await api('GET', '/api/promos');
      render();
    } catch (e) {
      content.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
    }
  }

  function render() {
    if (!promos.length) {
      content.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div><p>Промокодов пока нет. Добавьте первый!</p></div>`;
      return;
    }

    const totalSales   = promos.reduce((s, p) => s + (p.total_sales || 0), 0);
    const totalReward  = promos.reduce((s, p) => s + (p.total_reward || 0), 0);
    const totalOrders  = promos.reduce((s, p) => s + (p.usage_count || 0), 0);

    content.innerHTML = `
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-icon">🤝</div>
          <div class="stat-value">${promos.length}</div>
          <div class="stat-label">Промокодов</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📦</div>
          <div class="stat-value">${totalOrders}</div>
          <div class="stat-label">Заказов по промокодам</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-value">${fmtPrice(totalSales)}</div>
          <div class="stat-label">Продаж по промокодам</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🎁</div>
          <div class="stat-value">${fmtPrice(totalReward)}</div>
          <div class="stat-label">Итого вознаграждений</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">🏷️ Промокоды партнёров</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Промокод</th>
                <th>Партнёр</th>
                <th>Скидка</th>
                <th>Статус</th>
                <th>Telegram Chat ID</th>
                <th>Заказов</th>
                <th>Продажи</th>
                <th>Вознаграждение</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              ${promos.map(p => `
                <tr>
                  <td><strong style="font-size:15px;letter-spacing:1px">${p.code}</strong></td>
                  <td>${p.partner_name}</td>
                  <td><span class="badge badge-new">${p.discount_pct}%</span></td>
                  <td>
                    <label class="toggle" title="${p.active ? 'Активен' : 'Отключён'}">
                      <input type="checkbox" ${p.active ? 'checked' : ''} onchange="toggleActive(${p.id}, this.checked)">
                      <span class="toggle-slider"></span>
                    </label>
                  </td>
                  <td style="font-size:12px;color:var(--text-muted)">${p.telegram_chat_id || '—'}</td>
                  <td>
                    ${p.usage_count > 0
                      ? `<a href="#" onclick="showUsages(${p.id}, '${p.code}');return false" style="color:var(--accent);font-weight:700">${p.usage_count}</a>`
                      : '0'}
                  </td>
                  <td>${fmtPrice(p.total_sales || 0)}</td>
                  <td style="font-weight:700;color:var(--success)">${fmtPrice(p.total_reward || 0)}</td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-ghost btn-sm" onclick="openEditModal(${p.id})">✏️</button>
                      <button class="btn btn-danger btn-sm" onclick="deletePromo(${p.id}, '${p.code}')">🗑️</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ─── Переключение активности ────────────────────────────────────────────────
  window.toggleActive = async function (id, active) {
    const p = promos.find(x => x.id === id);
    if (!p) return;
    try {
      await api('PUT', `/api/promos/${id}`, { ...p, active });
      p.active = active ? 1 : 0;
      toast(active ? '✅ Промокод активирован' : '⛔ Промокод отключён');
    } catch (e) {
      toast(e.message, 'error');
      load();
    }
  };

  // ─── Удаление ──────────────────────────────────────────────────────────────
  window.deletePromo = async function (id, code) {
    if (!confirm(`Удалить промокод ${code}? История использований тоже удалится.`)) return;
    try {
      await api('DELETE', `/api/promos/${id}`);
      toast('🗑️ Промокод удалён');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ─── Модалка создания ──────────────────────────────────────────────────────
  window.openCreateModal = function () {
    document.getElementById('promoModalTitle').textContent = '➕ Новый промокод';
    document.getElementById('promoId').value = '';
    document.getElementById('promoCode').value = '';
    document.getElementById('promoPartner').value = '';
    document.getElementById('promoDiscount').value = '3';
    document.getElementById('promoTgChat').value = '';
    openModal('promoModal');
  };

  // ─── Модалка редактирования ────────────────────────────────────────────────
  window.openEditModal = function (id) {
    const p = promos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('promoModalTitle').textContent = '✏️ Редактировать промокод';
    document.getElementById('promoId').value = p.id;
    document.getElementById('promoCode').value = p.code;
    document.getElementById('promoPartner').value = p.partner_name;
    document.getElementById('promoDiscount').value = p.discount_pct;
    document.getElementById('promoTgChat').value = p.telegram_chat_id || '';
    openModal('promoModal');
  };

  // ─── Сохранить промокод ────────────────────────────────────────────────────
  window.savePromo = async function () {
    const id = document.getElementById('promoId').value;
    const payload = {
      code: document.getElementById('promoCode').value.trim().toUpperCase(),
      partner_name: document.getElementById('promoPartner').value.trim(),
      discount_pct: parseFloat(document.getElementById('promoDiscount').value) || 3,
      telegram_chat_id: document.getElementById('promoTgChat').value.trim() || null,
      active: 1,
    };
    if (!payload.code || !payload.partner_name) {
      toast('Заполните промокод и имя партнёра', 'error'); return;
    }
    try {
      if (id) {
        await api('PUT', `/api/promos/${id}`, { ...promos.find(x => x.id == id), ...payload });
        toast('✅ Промокод обновлён', 'success');
      } else {
        await api('POST', '/api/promos', payload);
        toast('✅ Промокод создан', 'success');
      }
      closeModal('promoModal');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // ─── История использований ─────────────────────────────────────────────────
  window.showUsages = async function (id, code) {
    document.getElementById('usagesTitle').textContent = `История: ${code}`;
    document.getElementById('usagesBody').innerHTML = '<div class="loader">Загрузка...</div>';
    openModal('usagesModal');
    try {
      const usages = await api('GET', `/api/promos/${id}/usages`);
      if (!usages.length) {
        document.getElementById('usagesBody').innerHTML = '<div class="empty-state"><p>Использований нет</p></div>';
        return;
      }
      document.getElementById('usagesBody').innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Дата</th><th>Клиент</th><th>Телефон</th><th>Товар</th><th>Сумма заказа</th><th>Вознаграждение</th></tr></thead>
            <tbody>
              ${usages.map(u => `
                <tr>
                  <td>${fmtDate(u.created_at)}</td>
                  <td>${u.lead_name || '—'}</td>
                  <td>${u.lead_phone || '—'}</td>
                  <td>${u.product_name || '—'}</td>
                  <td>${fmtPrice(u.order_amount)}</td>
                  <td style="color:var(--success);font-weight:700">${fmtPrice(u.reward_amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      document.getElementById('usagesBody').innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
    }
  };

  // ─── HTML модалок (вставляется один раз) ───────────────────────────────────
  if (!document.getElementById('promoModal')) {
    document.body.insertAdjacentHTML('beforeend', `
      <!-- Модалка создания/редактирования промокода -->
      <div class="modal-overlay" id="promoModal">
        <div class="modal" style="max-width:480px">
          <div class="modal-header">
            <h3 id="promoModalTitle">Промокод</h3>
            <button class="modal-close" onclick="closeModal('promoModal')">✕</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="promoId">
            <div class="form-group">
              <label>Промокод</label>
              <input type="text" id="promoCode" placeholder="ИЛЬДАР" style="text-transform:uppercase;font-size:16px;font-weight:700;letter-spacing:2px">
            </div>
            <div class="form-group">
              <label>Имя партнёра</label>
              <input type="text" id="promoPartner" placeholder="Ильдар Иванов">
            </div>
            <div class="form-group">
              <label>Скидка (%)</label>
              <input type="number" id="promoDiscount" value="3" min="0.1" max="100" step="0.1">
            </div>
            <div class="form-group">
              <label>Telegram Chat ID (для уведомлений)</label>
              <input type="text" id="promoTgChat" placeholder="123456789">
              <small style="color:var(--text-muted);font-size:11px;margin-top:4px;display:block">
                Партнёр должен написать боту /start, после чего Chat ID появится в логах.
                Или пусть отправит @userinfobot в Telegram.
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" onclick="closeModal('promoModal')">Отмена</button>
            <button class="btn btn-accent" onclick="savePromo()">💾 Сохранить</button>
          </div>
        </div>
      </div>

      <!-- Модалка истории использований -->
      <div class="modal-overlay" id="usagesModal">
        <div class="modal" style="max-width:720px">
          <div class="modal-header">
            <h3 id="usagesTitle">История использований</h3>
            <button class="modal-close" onclick="closeModal('usagesModal')">✕</button>
          </div>
          <div class="modal-body" id="usagesBody"></div>
        </div>
      </div>
    `);
  }

  load();
})();
