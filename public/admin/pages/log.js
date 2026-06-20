// Log page
$('pageActions').innerHTML = `
  <a href="/api/backup" class="btn btn-accent">💾 Скачать бэкап БД</a>
`;

$('content').innerHTML = `
  <div class="card">
    <div class="card-header">📝 Журнал действий администратора</div>
    <div class="table-wrap" id="logTable"><div class="loader">Загрузка...</div></div>
  </div>
`;

const ACTION_LABELS = {
  product_create: '➕ Создан товар',
  product_update: '✏️ Обновлён товар',
  product_delete: '🗑️ Удалён товар',
  product_image: '📷 Загружено фото',
  lead_status: '📋 Статус заявки',
  lead_delete: '🗑️ Удалена заявка',
  settings_update: '⚙️ Настройки',
  review_moderate: '⭐ Модерация отзыва',
  portfolio_add: '🖼️ Портфолио',
  seo_update: '🔍 SEO',
  calculator_update: '🧮 Калькулятор',
  backup: '💾 Бэкап',
};

(async function() {
  try {
    const log = await api('GET', '/api/log');
    if (!log.length) {
      $('logTable').innerHTML = '<div class="empty-state" style="padding:40px"><div class="empty-icon">📝</div><p>Журнал пуст</p></div>';
      return;
    }
    $('logTable').innerHTML = `
      <table>
        <thead>
          <tr><th>Действие</th><th>Детали</th><th>IP</th><th>Дата</th></tr>
        </thead>
        <tbody>
          ${log.map(entry => `
            <tr>
              <td><span class="log-action">${ACTION_LABELS[entry.action] || entry.action}</span></td>
              <td style="color:var(--text-muted);font-size:13px">${entry.details || '—'}</td>
              <td style="font-size:12px;color:var(--text-muted)">${entry.ip || '—'}</td>
              <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${fmtDate(entry.created_at)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    $('logTable').innerHTML = `<div class="empty-state" style="padding:40px"><p>Ошибка: ${e.message}</p></div>`;
  }
})();
