// Stats page
let visitChart, pageChart;

$('pageActions').innerHTML = `
  <select id="daysSelect" class="btn btn-ghost" onchange="loadStats(this.value)">
    <option value="7">7 дней</option>
    <option value="14">14 дней</option>
    <option value="30" selected>30 дней</option>
    <option value="90">90 дней</option>
  </select>
`;

$('content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px" class="stats-charts">
    <div class="card">
      <div class="card-header">📈 Посещаемость по дням</div>
      <div class="card-body"><div class="chart-container" style="height:260px"><canvas id="visitChart"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-header">📱 Устройства</div>
      <div class="card-body"><div class="chart-container" style="height:260px"><canvas id="deviceChart"></canvas></div></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="stats-charts2">
    <div class="card">
      <div class="card-header">📄 Топ страниц</div>
      <div class="card-body" id="topPagesTable"><div class="loader">Загрузка...</div></div>
    </div>
    <div class="card">
      <div class="card-header">🔗 Источники трафика</div>
      <div class="card-body" id="refererTable"><div class="loader">Загрузка...</div></div>
    </div>
  </div>
  <style>
    @media(max-width:768px){.stats-charts,.stats-charts2{grid-template-columns:1fr!important}}
  </style>
`;

async function loadStats(days = 30) {
  try {
    const data = await api('GET', `/api/stats?days=${days}`);
    const { byDay, byPage, byDevice, byReferer } = data;

    // Visit chart
    if (visitChart) visitChart.destroy();
    const ctx = document.getElementById('visitChart').getContext('2d');
    visitChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: byDay.map(d => d.d.slice(5)),
        datasets: [{
          label: 'Уникальных посетителей',
          data: byDay.map(d => d.c),
          backgroundColor: '#21372f',
          borderRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    // Device chart
    if (deviceChart) deviceChart.destroy();
    const dCtx = document.getElementById('deviceChart').getContext('2d');
    const dMap = { desktop: 0, mobile: 0 };
    byDevice.forEach(d => dMap[d.device] = d.c);
    const total = dMap.desktop + dMap.mobile;
    deviceChart = new Chart(dCtx, {
      type: 'doughnut',
      data: {
        labels: [`Компьютер (${dMap.desktop})`, `Мобильный (${dMap.mobile})`],
        datasets: [{ data: [dMap.desktop, dMap.mobile], backgroundColor: ['#21372f', '#d98e3c'], borderWidth: 3 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // Top pages table
    $('topPagesTable').innerHTML = byPage.length ? `
      <table>
        <thead><tr><th>Страница</th><th>Просмотры</th><th>%</th></tr></thead>
        <tbody>${byPage.map(p => {
          const pct = total > 0 ? Math.round(p.c / byDay.reduce((a, d) => a + d.c, 0) * 100) : 0;
          return `<tr>
            <td><code>${p.page}</code></td>
            <td><strong>${p.c}</strong></td>
            <td>
              <div style="display:flex;align-items:center;gap:6px">
                <div style="background:var(--border);border-radius:4px;height:8px;flex:1;overflow:hidden">
                  <div style="background:var(--primary);height:100%;width:${Math.min(100, p.c / (byPage[0]?.c || 1) * 100)}%"></div>
                </div>
              </div>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty-state"><p>Нет данных</p></div>';

    // Referer table
    $('refererTable').innerHTML = byReferer.length ? `
      <table>
        <thead><tr><th>Источник</th><th>Переходов</th></tr></thead>
        <tbody>${byReferer.map(r => {
          let src = r.referer;
          try { src = new URL(r.referer).hostname; } catch(e) {}
          return `<tr><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.referer}">${src}</td><td><strong>${r.c}</strong></td></tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty-state"><p>Прямые переходы или нет данных</p></div>';

  } catch(e) {
    $('content').innerHTML = `<div class="empty-state"><p>Ошибка: ${e.message}</p></div>`;
  }
}

loadStats(30);
