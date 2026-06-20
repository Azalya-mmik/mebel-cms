const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'db', 'mebel.db');
let _db = null;

function getDb() {
  if (!_db) {
    _db = new sqlite3.Database(DB_PATH);
  }
  return _db;
}

function run(sql, params = []) {
  return new Promise((res, rej) => {
    getDb().run(sql, params, function(err) { err ? rej(err) : res(this); });
  });
}
function get(sql, params = []) {
  return new Promise((res, rej) => {
    getDb().get(sql, params, (err, row) => err ? rej(err) : res(row));
  });
}
function all(sql, params = []) {
  return new Promise((res, rej) => {
    getDb().all(sql, params, (err, rows) => err ? rej(err) : res(rows));
  });
}
function exec(sql) {
  return new Promise((res, rej) => {
    getDb().exec(sql, err => err ? rej(err) : res());
  });
}

async function initDb() {
  await exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, description TEXT,
      price INTEGER DEFAULT 0, category TEXT DEFAULT 'other',
      status TEXT DEFAULT 'available', image TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, phone TEXT, message TEXT,
      status TEXT DEFAULT 'new', source TEXT DEFAULT 'site',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT, ip TEXT, user_agent TEXT,
      device TEXT DEFAULT 'desktop', referer TEXT, session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL, text TEXT NOT NULL,
      rating INTEGER DEFAULT 5, status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, description TEXT, image TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS faq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL, answer TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS seo (
      page TEXT PRIMARY KEY, title TEXT, description TEXT, keywords TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admin_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL, details TEXT, ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS calculator (
      id TEXT PRIMARY KEY, label TEXT NOT NULL,
      value REAL DEFAULT 1.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const defaults = [
    ['phone','+7 (XXX) XXX-XX-XX'],['address','г. Казань'],
    ['email','info@example.com'],['vk','https://vk.com/'],
    ['telegram','https://t.me/'],['whatsapp',''],
    ['site_name','Мебель на заказ'],['site_tagline','Качественная мебель'],
    ['banner_active','0'],['banner_title','Акция!'],['banner_text','Скидки на мебель'],
  ];
  for (const [k,v] of defaults) {
    await run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', [k,v]);
  }

  const calcDefaults = [
    ['base_price','Базовая цена за м²',5000],
    ['coef_oak','Коэф. дуб',1.8],['coef_pine','Коэф. сосна',1.0],
    ['coef_mdf','Коэф. МДФ',0.7],['coef_premium','Премиум фурнитура',1.3],
    ['coef_standard','Стандарт фурнитура',1.0],['delivery_base','Доставка',1500],
  ];
  for (const [id,label,value] of calcDefaults) {
    await run('INSERT OR IGNORE INTO calculator (id,label,value) VALUES (?,?,?)',[id,label,value]);
  }

  const count = await get('SELECT COUNT(*) c FROM products');
  if (!count.c) {
    const items = [
      ['Кровать двуспальная "Классик"','Массив сосны',35000,'beds'],
      ['Диван угловой "Комфорт"','Независимые пружины',48000,'sofas'],
      ['Шкаф-купе 3-дверный','Зеркальные двери',28000,'wardrobes'],
      ['Кухонный гарнитур "Модерн"','МДФ с плёнкой',75000,'kitchen'],
    ];
    for (const [name,desc,price,cat] of items) {
      await run('INSERT INTO products (name,description,price,category) VALUES (?,?,?,?)',[name,desc,price,cat]);
    }
  }

  const hash = await bcrypt.hash('aidar9', 10);
  process.env.ADMIN_PASSWORD_HASH = hash;
  console.log('✅ БД готова, пароль установлен');
}

module.exports = { getDb, initDb, run, get, all, exec };
