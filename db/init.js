const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(DATA_DIR, 'db', 'mebel.db');

let db;

function getDb() {
  if (!db) {
    try { require('fs').mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch (e) {}
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    -- Товары каталога
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER DEFAULT 0,
      category TEXT DEFAULT 'other',
      status TEXT DEFAULT 'available',
      image TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Заявки от клиентов
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      message TEXT,
      status TEXT DEFAULT 'new',
      source TEXT DEFAULT 'site',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Статистика посещений
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT,
      ip TEXT,
      user_agent TEXT,
      device TEXT DEFAULT 'desktop',
      referer TEXT,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Настройки сайта
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Отзывы клиентов
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      rating INTEGER DEFAULT 5,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Портфолио
    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      image TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- FAQ
    CREATE TABLE IF NOT EXISTS faq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    -- Акции/баннеры
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      text TEXT,
      discount TEXT,
      active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- SEO настройки
    CREATE TABLE IF NOT EXISTS seo (
      page TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      keywords TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Лог действий администратора
    CREATE TABLE IF NOT EXISTS admin_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Калькулятор (коэффициенты цен)
    CREATE TABLE IF NOT EXISTS calculator (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      value REAL DEFAULT 1.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Партнёрские промокоды
    CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      partner_name TEXT NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 3,
      active INTEGER NOT NULL DEFAULT 1,
      telegram_chat_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Использования промокодов (привязываются к заявке)
    CREATE TABLE IF NOT EXISTS promo_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promo_id INTEGER NOT NULL REFERENCES promo_codes(id),
      lead_id INTEGER NOT NULL REFERENCES leads(id),
      order_amount INTEGER NOT NULL DEFAULT 0,
      reward_amount REAL NOT NULL DEFAULT 0,
      product_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Начальные настройки
  const defaults = [
    ['phone', '+79274085023'],
    ['address', ''],
    ['email', ''],
    ['vk', 'https://vk.com/im?sel=-140569973'],
    ['telegram', ''],
    ['whatsapp', ''],
    ['avito', ''],
    ['site_name', 'R&T Мебель'],
    ['site_tagline', 'Доставка по России'],
    ['banner_active', '0'],
    ['banner_title', 'Акция!'],
    ['banner_text', ''],
  ];

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of defaults) {
    insertSetting.run(k, v);
  }

  // Начальные коэффициенты калькулятора
  const calcDefaults = [
    ['base_price', 'Базовая цена за м²', 5000],
    ['coef_oak', 'Коэф. дуб', 1.8],
    ['coef_pine', 'Коэф. сосна', 1.0],
    ['coef_mdf', 'Коэф. МДФ', 0.7],
    ['coef_premium', 'Коэф. премиум фурнитура', 1.3],
    ['coef_standard', 'Коэф. стандарт фурнитура', 1.0],
    ['delivery_base', 'Базовая стоимость доставки', 1500],
  ];

  const insertCalc = db.prepare(
    'INSERT OR IGNORE INTO calculator (id, label, value) VALUES (?, ?, ?)'
  );
  for (const [id, label, value] of calcDefaults) {
    insertCalc.run(id, label, value);
  }

  // Стартовые вопросы FAQ (добавляются один раз, если таблица пуста)
  const faqCount = db.prepare('SELECT COUNT(*) as c FROM faq').get();
  if (faqCount.c === 0) {
    const insFaq = db.prepare('INSERT INTO faq (question, answer, sort_order, active) VALUES (?, ?, ?, 1)');
    [
      ['Сколько изготавливается мебель?', 'В среднем 14–30 дней — зависит от модели, комплектации и загруженности производства.', 1],
      ['Можно изменить размеры?', 'Да, мы изготавливаем мебель по вашим индивидуальным размерам.', 2],
      ['Можно выбрать ткань?', 'Да, есть более 50 вариантов тканей и цветов под любой интерьер.', 3],
      ['Есть доставка?', 'Да, организуем доставку по РТ и заранее согласуем удобную дату.', 4],
      ['Как оформить заказ?', 'Оставьте заявку — мы свяжемся, уточним детали и подготовим расчёт без обязательств.', 5],
    ].forEach(([q, a, o]) => insFaq.run(q, a, o));
  }

  // ── Каталог: расширяем таблицу products нужными полями (миграция) ──
  const cols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
  const addCol = (name, def) => { if (!cols.includes(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${def}`); };
  addCol('colors', 'TEXT');     // JSON-массив строк
  addCol('specs', 'TEXT');      // JSON-массив строк
  addCol('images', 'TEXT');     // JSON-массив data-URI/URL
  addCol('cost_rot', 'INTEGER');// доп. цена (поворотный механизм и т.п.), может быть NULL

  // ── Стартовый каталог R&T (15 товаров) — заливаем один раз ──
  const catV = db.prepare("SELECT value FROM settings WHERE key='catalog_v'").get();
  if (!catV || catV.value !== '2') {
    let seed = [];
    try { seed = require('./seed-catalog.json'); } catch (e) { seed = []; }
    if (seed.length) {
      db.exec('DELETE FROM products');
      const ins = db.prepare(`INSERT INTO products
        (name, description, price, category, status, image, images, specs, colors, cost_rot, sort_order)
        VALUES (?, ?, ?, ?, 'available', ?, ?, ?, ?, ?, ?)`);
      seed.forEach((p, idx) => {
        const imgs = Array.isArray(p.imgs) ? p.imgs : [];
        ins.run(
          p.name || '', p.description || '', parseInt(p.cost) || 0, p.type || 'Прочее',
          imgs[0] || '', JSON.stringify(imgs),
          JSON.stringify(p.specs || []), JSON.stringify(p.colors || []),
          (p.costRot != null ? parseInt(p.costRot) : null), idx
        );
      });
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('catalog_v', '2')").run();
  }

  // Пароль администратора берётся ТОЛЬКО из переменной окружения.
  checkAdminPassword();

  console.log('✅ База данных инициализирована');
  return db;
}

function checkAdminPassword() {
  if (!process.env.ADMIN_PASSWORD_HASH) {
    console.warn('⚠️  ADMIN_PASSWORD_HASH не задан! Вход в админку работать не будет.');
    console.warn('    Сгенерируй хеш локально:  node scripts/hash.js ТВОЙ_ПАРОЛЬ');
    console.warn('    и добавь его в переменные окружения приложения на Timeweb.');
  }
}

function closeDb() {
  if (db) { try { db.close(); } catch (e) {} db = null; }
}

// Переоткрыть базу после восстановления файла из бэкапа
function reopenDb() {
  closeDb();
  // подчистить WAL/SHM, чтобы открылся именно восстановленный файл
  const fs = require('fs');
  for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(DB_PATH + ext); } catch (e) {} }
  initDb();
}

module.exports = { getDb, initDb, closeDb, reopenDb, DB_PATH };
