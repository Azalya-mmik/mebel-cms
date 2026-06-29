require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

const { initDb, getDb } = require('./db/init');
const s3sync = require('./db/s3sync');
const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');
const trackVisit = require('./middleware/tracker');
const { requireAuth } = require('./middleware/auth');

// Инициализация БД
// Инициализация БД и старт сервера — в конце файла (после восстановления из S3)

const app = express();
const PORT = process.env.PORT || 3000;

// Каталог для данных, которые должны переживать редеплой (БД, сессии, загрузки).
// На Timeweb App Platform задай DATA_DIR=/data и примонтируй туда сетевой диск.
const DATA_DIR = process.env.DATA_DIR || __dirname;
for (const d of [path.join(DATA_DIR, 'db'), path.join(DATA_DIR, 'public', 'uploads')]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
}

// За обратным прокси Timeweb (HTTPS) — чтобы куки и IP определялись верно
app.set('trust proxy', 1);

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  createParentPath: true,
  abortOnLimit: true
}));

// Сессии
app.use(session({
  // Хранилище сессий — в памяти (после редеплоя нужно заново войти в /admin).
  // Так нет нативной зависимости sqlite3 → сборка на App Platform не падает.
  secret: process.env.SESSION_SECRET || 'fallback_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS на проде
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 дней
  }
}));

// Трекинг посещений
app.use(trackVisit);

// Статика
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(DATA_DIR, 'public', 'uploads')));

// ─── РОУТЫ ────────────────────────────────────────────────────────────────────
app.use('/admin', authRouter);
// Любой изменяющий запрос к API → пометить базу на выгрузку в S3
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => { if (res.statusCode < 400) s3sync.markDirty(); });
  }
  next();
});
app.use('/api', require('./routes/public')); // публичный API сайта (без авторизации)
app.use('/api', apiRouter);                  // админ API (требует логина)

// Публичный приём заявок теперь через POST /api/public/lead (см. routes/public.js)

// Страница предпросмотра (live preview с флагом preview=1)
app.get('/preview', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── ГЛАВНАЯ СТРАНИЦА АДМИНКИ ─────────────────────────────────────────────────
app.get('/admin', requireAuth, (req, res) => {
  res.send(adminLayout('dashboard'));
});

app.get('/admin/products', requireAuth, (req, res) => {
  res.send(adminLayout('products'));
});

app.get('/admin/leads', requireAuth, (req, res) => {
  res.send(adminLayout('leads'));
});

app.get('/admin/settings', requireAuth, (req, res) => {
  res.send(adminLayout('settings'));
});

app.get('/admin/backup', requireAuth, (req, res) => {
  res.send(adminLayout('backup'));
});

app.get('/admin/portfolio', requireAuth, (req, res) => {
  res.send(adminLayout('portfolio'));
});

app.get('/admin/faq', requireAuth, (req, res) => {
  res.send(adminLayout('faq'));
});

app.get('/admin/seo', requireAuth, (req, res) => {
  res.send(adminLayout('seo'));
});

app.get('/admin/calculator', requireAuth, (req, res) => {
  res.send(adminLayout('calculator'));
});

app.get('/admin/log', requireAuth, (req, res) => {
  res.send(adminLayout('log'));
});

app.get('/admin/promos', requireAuth, (req, res) => {
  res.send(adminLayout('promos'));
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Не найдено' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── СТАРТ ────────────────────────────────────────────────────────────────────
(async () => {
  await s3sync.restoreOnBoot();   // скачать базу из S3 (если есть)
  initDb();                       // открыть/создать базу (+ засеять каталог при первом запуске)
  s3sync.start(getDb);            // включить авто-выгрузку в S3
  s3sync.markDirty();             // закрепить засеянный каталог в S3 сразу после старта
  app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`🔐 Админка: http://localhost:${PORT}/admin`);
  });
})();

// ─── ШАБЛОН АДМИНКИ ──────────────────────────────────────────────────────────
function adminLayout(page) {
  const pages = {
    dashboard: { title: 'Дашборд', icon: '📊' },
    leads: { title: 'Заявки', icon: '📋' },
    products: { title: 'Каталог товаров', icon: '🛋️' },
    portfolio: { title: 'Наши работы', icon: '🖼️' },
    faq: { title: 'Частые вопросы', icon: '❓' },
    settings: { title: 'Настройки сайта', icon: '⚙️' },
    seo: { title: 'SEO', icon: '🔍' },
    calculator: { title: 'Калькулятор', icon: '🧮' },
    backup: { title: 'Бэкап', icon: '💾' },
    log: { title: 'Журнал действий', icon: '📝' },
    promos: { title: 'Партнёры', icon: '🤝' },
  };

  const nav = Object.entries(pages).map(([key, info]) => `
    <a href="/admin/${key === 'dashboard' ? '' : key}" class="nav-item ${page === key ? 'active' : ''}" data-page="${key}">
      <span class="nav-icon">${info.icon}</span>
      <span class="nav-label">${info.title}</span>
    </a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ru" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pages[page]?.title || 'Админка'} — Мебель на заказ</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    ${adminCSS()}
  </style>
</head>
<body>
  <div class="layout">
    <!-- Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <span class="logo-icon">🪑</span>
        <div class="logo-text">
          <strong>Мебель на заказ</strong>
          <small>Панель управления</small>
        </div>
        <button class="theme-btn" onclick="toggleTheme()" title="Сменить тему">🌙</button>
      </div>
      <nav class="sidebar-nav">
        ${nav}
      </nav>
      <div class="sidebar-footer">
        <a href="/" target="_blank" class="nav-item">
          <span class="nav-icon">🌐</span>
          <span class="nav-label">Открыть сайт</span>
        </a>
        <a href="/admin/logout" class="nav-item logout">
          <span class="nav-icon">🚪</span>
          <span class="nav-label">Выйти</span>
        </a>
      </div>
    </aside>

    <!-- Mobile header -->
    <div class="mobile-header">
      <button class="burger" onclick="toggleSidebar()">☰</button>
      <span>${pages[page]?.icon} ${pages[page]?.title}</span>
      <a href="/admin/logout" class="mob-logout">Выйти</a>
    </div>

    <!-- Overlay -->
    <div class="overlay" id="overlay" onclick="closeSidebar()"></div>

    <!-- Main content -->
    <main class="main">
      <div class="page-header">
        <h1>${pages[page]?.icon} ${pages[page]?.title}</h1>
        <div class="page-actions" id="pageActions"></div>
      </div>
      <div class="content" id="content">
        <div class="loader">Загрузка...</div>
      </div>
    </main>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const CURRENT_PAGE = '${page}';
    ${adminJS()}
  </script>
  <script src="/admin/pages/${page}.js"></script>
</body>
</html>`;
}

function adminCSS() {
  return `
    :root {
      --bg: #f4f6f8;
      --surface: #ffffff;
      --sidebar-bg: #1a2e25;
      --sidebar-text: #c8d8cc;
      --sidebar-active: #2d4a38;
      --primary: #21372f;
      --accent: #d98e3c;
      --accent-d: #be7626;
      --text: #1a2332;
      --text-muted: #6b7c85;
      --border: #e2e8f0;
      --danger: #e53e3e;
      --success: #38a169;
      --warning: #d69e2e;
      --info: #3182ce;
      --shadow: 0 1px 3px rgba(0,0,0,.1), 0 1px 2px rgba(0,0,0,.06);
      --shadow-md: 0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06);
      --r: 12px;
    }
    [data-theme="dark"] {
      --bg: #0f1923;
      --surface: #1a2535;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --border: #2d3748;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5; }
    html, body { max-width: 100%; overflow-x: hidden; }
    
    .layout { display: flex; min-height: 100vh; max-width: 100%; }
    
    /* Sidebar */
    .sidebar { width: 240px; background: var(--sidebar-bg); color: var(--sidebar-text); display: flex; flex-direction: column; flex-shrink: 0; position: sticky; top: 0; height: 100vh; overflow-y: auto; transition: transform .3s; z-index: 100; }
    .sidebar-header { padding: 20px 16px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #ffffff15; }
    .logo-icon { font-size: 28px; }
    .logo-text strong { display: block; font-size: 14px; color: #fff; }
    .logo-text small { font-size: 11px; opacity: .7; }
    .theme-btn { margin-left: auto; background: none; border: none; cursor: pointer; font-size: 18px; }
    .sidebar-nav { flex: 1; padding: 12px 8px; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; color: var(--sidebar-text); text-decoration: none; font-size: 13.5px; font-weight: 600; transition: background .15s; cursor: pointer; }
    .nav-item:hover { background: #ffffff15; color: #fff; }
    .nav-item.active { background: var(--sidebar-active); color: #fff; }
    .nav-item.logout:hover { background: #e53e3e33; color: #fc8181; }
    .nav-icon { width: 20px; text-align: center; font-size: 16px; }
    .sidebar-footer { padding: 12px 8px; border-top: 1px solid #ffffff15; }
    
    /* Mobile */
    .mobile-header { display: none; position: sticky; top: 0; z-index: 90; background: var(--sidebar-bg); color: #fff; padding: 12px 16px; align-items: center; gap: 12px; font-weight: 700; font-size: 15px; }
    .burger { background: none; border: none; color: #fff; font-size: 22px; cursor: pointer; }
    .mob-logout { margin-left: auto; color: #fc8181; font-size: 13px; text-decoration: none; font-weight: 600; }
    .overlay { display: none; position: fixed; inset: 0; background: #0009; z-index: 99; }
    
    /* Main */
    .main { flex: 1; display: flex; flex-direction: column; min-width: 0; max-width: 100%; overflow-x: hidden; }
    .page-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
    .page-header h1 { font-size: 22px; font-weight: 800; }
    .page-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .content { padding: 20px 24px; flex: 1; }
    .loader { text-align: center; padding: 60px; color: var(--text-muted); font-size: 16px; }
    
    /* Cards */
    .card { background: var(--surface); border-radius: var(--r); box-shadow: var(--shadow); overflow: hidden; }
    .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 15px; }
    .card-body { padding: 20px; }
    
    /* Stats grid */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .stat-card { background: var(--surface); border-radius: var(--r); padding: 20px; box-shadow: var(--shadow); }
    .stat-value { font-size: 32px; font-weight: 800; color: var(--primary); }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
    .stat-icon { font-size: 24px; margin-bottom: 8px; }
    
    /* Buttons */
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13.5px; font-weight: 700; cursor: pointer; border: none; font-family: inherit; transition: all .15s; text-decoration: none; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-primary:hover { background: #2d4a38; }
    .btn-accent { background: var(--accent); color: #fff; }
    .btn-accent:hover { background: var(--accent-d); }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-danger:hover { background: #c53030; }
    .btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
    .btn-ghost:hover { background: var(--bg); }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .btn-success { background: var(--success); color: #fff; }
    
    /* Table */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { background: var(--bg); padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
    td { padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg); }
    
    /* Badges */
    .badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .badge-new { background: #ebf8ff; color: #2b6cb0; }
    .badge-working { background: #fffbeb; color: #b7791f; }
    .badge-done { background: #f0fff4; color: #276749; }
    .badge-rejected { background: #fff5f5; color: #c53030; }
    .badge-pending { background: #fffbeb; color: #b7791f; }
    .badge-approved { background: #f0fff4; color: #276749; }
    .badge-available { background: #f0fff4; color: #276749; }
    .badge-order { background: #ebf8ff; color: #2b6cb0; }
    .badge-hidden { background: #f7fafc; color: #718096; }
    
    /* Form */
    .form-group { margin-bottom: 16px; }
    label { display: block; font-weight: 700; font-size: 12.5px; color: var(--text-muted); margin-bottom: 5px; text-transform: uppercase; letter-spacing: .4px; }
    input[type=text], input[type=number], input[type=email], input[type=tel], textarea, select {
      width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 8px;
      font-size: 14px; font-family: inherit; background: var(--surface); color: var(--text);
      outline: none; transition: border-color .2s;
    }
    input:focus, textarea:focus, select:focus { border-color: var(--primary); }
    textarea { resize: vertical; min-height: 80px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    
    /* Modal */
    .modal-overlay { display: none; position: fixed; inset: 0; background: #0007; z-index: 200; align-items: center; justify-content: center; padding: 16px; }
    .modal-overlay.open { display: flex; }
    .modal { background: var(--surface); border-radius: 16px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
    .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .modal-header h3 { font-size: 18px; font-weight: 800; }
    .modal-close { background: none; border: none; font-size: 22px; cursor: pointer; color: var(--text-muted); }
    .modal-body { padding: 24px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }
    
    /* Grid cards */
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .product-card { background: var(--surface); border-radius: var(--r); box-shadow: var(--shadow); overflow: hidden; display: flex; flex-direction: column; }
    .product-img { aspect-ratio: 4/3; background: var(--bg); display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
    .product-img img { width: 100%; height: 100%; object-fit: cover; }
    .product-img .no-img { font-size: 48px; opacity: .3; }
    .product-body { padding: 14px 16px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .product-name { font-weight: 800; font-size: 15px; }
    .product-price { font-size: 18px; font-weight: 800; color: var(--accent); }
    .product-actions { display: flex; gap: 6px; padding: 12px 16px; border-top: 1px solid var(--border); }
    
    /* Upload area */
    .upload-area { border: 2px dashed var(--border); border-radius: var(--r); padding: 24px; text-align: center; cursor: pointer; transition: border-color .2s; }
    .upload-area:hover { border-color: var(--primary); }
    .upload-area input { display: none; }
    .upload-area .upload-icon { font-size: 32px; margin-bottom: 8px; }
    .upload-area p { color: var(--text-muted); font-size: 13px; }
    
    /* Filter bar */
    .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
    .filter-bar input, .filter-bar select { width: auto; flex: 1; min-width: 140px; }
    
    /* Chart container */
    .chart-container { position: relative; height: 240px; }
    
    /* Tabs */
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
    .tab { padding: 10px 16px; border: none; background: none; font-size: 13.5px; font-weight: 700; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; font-family: inherit; transition: all .15s; }
    .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
    
    /* Toast */
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1a2332; color: #fff; padding: 12px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 700; display: none; z-index: 999; box-shadow: var(--shadow-md); max-width: 320px; }
    .toast.show { display: block; animation: slideIn .2s ease; }
    @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    
    /* Toggle switch */
    .toggle-wrap { display: flex; align-items: center; gap: 10px; }
    .toggle { position: relative; width: 48px; height: 26px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: var(--border); border-radius: 999px; cursor: pointer; transition: .3s; }
    .toggle-slider:before { content: ''; position: absolute; width: 20px; height: 20px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .3s; }
    .toggle input:checked + .toggle-slider { background: var(--success); }
    .toggle input:checked + .toggle-slider:before { transform: translateX(22px); }
    
    /* Portfolio grid */
    .portfolio-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .portfolio-item { position: relative; aspect-ratio: 1; border-radius: var(--r); overflow: hidden; cursor: pointer; }
    .portfolio-item img { width: 100%; height: 100%; object-fit: cover; }
    .portfolio-item .del-btn { position: absolute; top: 6px; right: 6px; background: #e53e3ecc; color: #fff; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px; font-weight: 700; }
    
    /* FAQ list */
    .faq-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 16px; margin-bottom: 10px; }
    .faq-q { font-weight: 800; margin-bottom: 6px; }
    .faq-a { color: var(--text-muted); font-size: 13px; }
    .faq-actions { display: flex; gap: 6px; margin-top: 10px; }
    
    /* Review card */
    .review-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); padding: 16px; margin-bottom: 10px; }
    .review-author { font-weight: 800; }
    .review-text { margin: 6px 0; color: var(--text-muted); font-size: 13px; }
    .review-meta { font-size: 12px; color: var(--text-muted); }
    .stars { color: var(--accent); }
    
    /* Log table */
    .log-action { font-weight: 700; font-size: 12px; background: var(--bg); padding: 2px 8px; border-radius: 6px; }
    
    /* Empty state */
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text-muted); }
    .empty-state .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .empty-state p { font-size: 15px; }
    
    /* Responsive */
    @media (max-width: 768px) {
      .layout { flex-direction: column; }
      .sidebar { position: fixed; left: -280px; top: 0; width: 260px; height: 100%; }
      .sidebar.open { left: 0; }
      .overlay.open { display: block; }
      .mobile-header { display: flex; }
      .content { padding: 16px; }
      .page-header { padding: 16px 16px 0; }
      .page-header h1 { font-size: 18px; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .form-row { grid-template-columns: 1fr; }
      .products-grid { grid-template-columns: 1fr 1fr; }
      .dash-grid, .dash-grid2, .settings-grid { grid-template-columns: 1fr !important; }
      .filter-bar input, .filter-bar select { min-width: 0; }
    }
    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .products-grid { grid-template-columns: 1fr; }
    }
  `;
}

function adminJS() {
  return `
    // Toast
    function toast(msg, type = '') {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.background = type === 'error' ? '#c53030' : type === 'success' ? '#276749' : '#1a2332';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }

    // Theme
    function toggleTheme() {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('admin-theme', next);
      document.querySelector('.theme-btn').textContent = next === 'dark' ? '☀️' : '🌙';
    }
    (function() {
      const saved = localStorage.getItem('admin-theme') || 'light';
      document.documentElement.setAttribute('data-theme', saved);
      const btn = document.querySelector('.theme-btn');
      if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
    })();

    // Sidebar
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('overlay').classList.toggle('open');
    }
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('overlay').classList.remove('open');
    }

    // API helpers
    async function api(method, url, data) {
      const opts = { method, headers: {} };
      if (data instanceof FormData) {
        opts.body = data;
      } else if (data) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(data);
      }
      const res = await fetch(url, opts);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка запроса');
      return json;
    }

    const $ = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    // Date format
    function fmtDate(str) {
      if (!str) return '—';
      const d = new Date(str);
      return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }
    function fmtPrice(n) {
      return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
    }

    // Modal helpers
    function openModal(id) { $(id).classList.add('open'); }
    function closeModal(id) { $(id).classList.remove('open'); }
    window.closeModal = closeModal;

    // Status labels
    const STATUS_LABELS = {
      new: 'Новая', working: 'В работе', done: 'Выполнена', rejected: 'Отклонена',
      pending: 'На модерации', approved: 'Опубликован',
      available: 'В наличии', order: 'Под заказ', hidden: 'Скрыт'
    };
    const STATUS_BADGE = {
      new: 'badge-new', working: 'badge-working', done: 'badge-done', rejected: 'badge-rejected',
      pending: 'badge-pending', approved: 'badge-approved',
      available: 'badge-available', order: 'badge-order', hidden: 'badge-hidden'
    };
    function badge(status) {
      return \`<span class="badge \${STATUS_BADGE[status] || ''}">\${STATUS_LABELS[status] || status}</span>\`;
    }
  `;
}

module.exports = app;
