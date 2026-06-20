const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, '..', 'db', 'mebel.db');

let db;

function getDb() {
  if (!db) {
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
  `);

  // Начальные настройки
  const defaults = [
    ['phone', '+7 (XXX) XXX-XX-XX'],
    ['address', 'г. Казань, ул. Примерная, 1'],
    ['email', 'info@example.com'],
    ['vk', 'https://vk.com/'],
    ['telegram', 'https://t.me/'],
    ['whatsapp', ''],
    ['site_name', 'Мебель на заказ'],
    ['site_tagline', 'Качественная мебель ручной работы'],
    ['banner_active', '0'],
    ['banner_title', 'Весенняя акция!'],
    ['banner_text', 'Скидка 10% на все диваны'],
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

  // Добавить тестовые данные если таблицы пустые
  const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (productCount.c === 0) {
    const sampleProducts = [
      ['Кровать двуспальная "Классик"', 'Изготовлена из массива сосны. Изголовье с мягкой обивкой.', 35000, 'beds', 'available'],
      ['Диван угловой "Комфорт"', 'Угловой диван с независимыми пружинами. Механизм дельфин.', 48000, 'sofas', 'available'],
      ['Шкаф-купе 3-дверный', 'Шкаф с зеркальными дверями. Внутренняя организация на выбор.', 28000, 'wardrobes', 'available'],
      ['Кухонный гарнитур "Модерн"', 'Гарнитур из МДФ с плёночным покрытием. Встроенная техника.', 75000, 'kitchen', 'available'],
      ['Детская кровать "Карапуз"', 'Кровать из экологичных материалов. Размер 80×160.', 18000, 'beds', 'available'],
    ];
    const ins = db.prepare('INSERT INTO products (name, description, price, category, status) VALUES (?, ?, ?, ?, ?)');
    for (const p of sampleProducts) ins.run(...p);
  }

  // Хэш пароля
  generatePasswordHash();

  console.log('✅ База данных инициализирована');
  return db;
}

async function generatePasswordHash() {
  const fs = require('fs');
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  try { envContent = fs.readFileSync(envPath, 'utf8'); } catch (e) {}

  // Если хэш уже правильный — пропустить
  if (envContent.includes('$2b$10$') && !envContent.includes('$2b$10$K8GpYJX')) return;

  const hash = await bcrypt.hash('aidar9', 10);
  if (envContent.includes('ADMIN_PASSWORD_HASH=')) {
    envContent = envContent.replace(/ADMIN_PASSWORD_HASH=.*/, `ADMIN_PASSWORD_HASH=${hash}`);
  } else {
    envContent += `\nADMIN_PASSWORD_HASH=${hash}`;
  }
  try {
    fs.writeFileSync(envPath, envContent);
    process.env.ADMIN_PASSWORD_HASH = hash;
    console.log('🔑 Пароль администратора установлен');
  } catch (e) {
    process.env.ADMIN_PASSWORD_HASH = hash;
  }
}

module.exports = { getDb, initDb };
