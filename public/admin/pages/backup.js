// Бэкап и откат базы (заявки + каталог) через S3
$('pageActions').innerHTML = `
  <button class="btn btn-accent" onclick="createBackup()">💾 Создать бэкап сейчас</button>
`;

$('content').innerHTML = `
  <div class="card" style="margin-bottom:16px">
    <p style="margin:0 0 8px;line-height:1.5">
      Здесь хранятся снимки базы (заявки и каталог товаров). Если на сайте что-то испортится —
      нажми «Восстановить» рядом с нужным снимком, и всё вернётся к этому моменту.
    </p>
    <p style="margin:0;color:var(--text-muted);font-size:13px">
      Снимки создаются автоматически и при нажатии кнопки выше. Также можно скачать копию базы к себе на компьютер.
    </p>
    <div style="margin-top:12px">
      <a class="btn btn-ghost btn-sm" href="/api/backup/download">⬇️ Скачать копию на компьютер</a>
    </div>
  </div>
  <div id="backupList"><div class="loader">Загрузка...</div></div>
`;

function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtSize(b) {
  if (!b) return '';
  return b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.round(b / 1024) + ' КБ';
}

async function loadBackups() {
  try {
    const r = await api('GET', '/api/backup');
    if (!r.enabled) {
      $('backupList').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>S3 не настроен — автоматические бэкапы недоступны.<br>Можно только скачать копию кнопкой выше.</p></div>';
      return;
    }
    if (!r.snapshots.length) {
      $('backupList').innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Снимков пока нет. Нажми «Создать бэкап сейчас».</p></div>';
      return;
    }
    $('backupList').innerHTML = `
      <div class="card" style="padding:0">
        ${r.snapshots.map((s, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;${i ? 'border-top:1px solid var(--border)' : ''}">
            <div>
              <div style="font-weight:600">${fmtWhen(s.date)}${i === 0 ? ' <span style="color:#276749;font-size:12px">• последний</span>' : ''}</div>
              <div style="font-size:12px;color:var(--text-muted)">${fmtSize(s.size)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="restoreBackup('${s.key}')">↩️ Восстановить</button>
          </div>
        `).join('')}
      </div>`;
  } catch (e) {
    $('backupList').innerHTML = `<div class="empty-state"><p>Ошибка: ${e.message}</p></div>`;
  }
}

async function createBackup() {
  try {
    await api('POST', '/api/backup/create');
    toast('Бэкап создан', 'success');
    loadBackups();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function restoreBackup(key) {
  if (!confirm('Восстановить базу из этого снимка? Текущие данные заменятся на сохранённые в нём.')) return;
  try {
    await api('POST', '/api/backup/restore', { key });
    toast('База восстановлена', 'success');
    loadBackups();
  } catch (e) {
    toast(e.message, 'error');
  }
}

loadBackups();
