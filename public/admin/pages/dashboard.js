(async function() {
  const content = $('content');

  content.innerHTML = `
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card"><div class="stat-icon">👁️</div><div class="stat-value" id="st-today">—</div><div class="stat-label">Посетителей сегодня</div></div>
      <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-value" id="st-week">—</div><div class="stat-label">За неделю</div></div>
      <div class="stat-card"><div class="stat-icon">📆</div><div class="stat-value" id="st-month">—</div><div class="stat-label">За месяц</div></div>
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value" id="st-leads">—</div><div class="stat-label">Новых заявок</div></div>
    </div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px" class="dash-grid">
      <div class="card">
        <div class="card-header">📈 Посещаемость за 7 дней</div>
        <div class="card-body">
          <div class="chart-container"><canvas id="visitChart"></canvas></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">📱 Устройства</div>
        <div class="card-body">
          <div class="chart-container"><canvas id="deviceChart"></canvas></div>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dash-grid2">
      <div class="card">
        <div class="card-header">🔥 Топ страниц (неделя)</div>
        <div class="card-body" id="topPages"><div class="loader">Загрузка...</div></div>
      </div>
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between">
          Последние заявки
          <a href="/admin/leads" class="btn btn-ghost btn-sm">Все →</a>
        </div>
        <div class="table-wrap" id="recentLeads"><div class="loader">Загрузка...</div></div>
      </div>
    </div>
    <style>
      @media(max-width:768px){.dash-grid,.dash-grid2{grid-template-columns:1fr!important}}
    </style>
  `;

  try {
    const data = await api('GET', '/api/dashboard');
    const { stats, topPages, recentLeads, chartData, deviceStats } = data;

    $('st-today').textContent = stats.visitsToday;
    $('st-week').textContent = stats.visitsWeek;
    $('st-month').textContent = stats.visitsMonth;
    $('st-leads').textContent = stats.newLeads;

    // Visit chart
    const ctx = document.getElementById('visitChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.map(d => d.d.slice(5)),
        datasets: [{
          label: 'Посетители',
          data: chartData.map(d => d.c),
          fill: true,
          backgroundColor: 'rgba(33,55,47,.1)',
          borderColor: '#21372f',
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#d98e3c'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    // Device chart
    const dCtx = document.getElementById('deviceChart').getContext('2d');
    const deviceMap = { desktop: 0, mobile: 0 };
    deviceStats.forEach(d => deviceMap[d.device] = d.c);
    new Chart(dCtx, {
      type: 'doughnut',
      data: {
        labels: ['Компьютер', 'Мобильный'],
        datasets: [{ data: [deviceMap.desktop, deviceMap.mobile], backgroundColor: ['#21372f', '#d98e3c'], borderWidth: 2 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // Top pages
    $('topPages').innerHTML = topPages.length ? `
      <table>
        <thead><tr><th>Страница</th><th>Просмотры</th></tr></thead>
        <tbody>${topPages.map(p => `<tr><td><code>${p.page}</code></td><td><strong>${p.cnt}</strong></td></tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state"><p>Нет данных</p></div>';

    // Recent leads
    $('recentLeads').innerHTML = recentLeads.length ? `
      <table>
        <thead><tr><th>Имя</th><th>Телефон</th><th>Статус</th><th>Дата</th></tr></thead>
        <tbody>${recentLeads.map(l => `
          <tr>
            <td>${l.name || '—'}</td>
            <td><a href="tel:${l.phone}">${l.phone}</a></td>
            <td>${badge(l.status)}</td>
            <td style="font-size:12px;color:var(--text-muted)">${fmtDate(l.created_at)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state"><p>Заявок пока нет</p></div>';

  } catch(e) {
    content.innerHTML = `<div class="empty-state"><p>Ошибка загрузки: ${e.message}</p></div>`;
  }
})();
