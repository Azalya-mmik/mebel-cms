const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/init');
const { requireAuth, logAction } = require('../middleware/auth');
const nodemailer = require('nodemailer');

// Middleware: все API роуты требуют авторизации
router.use(requireAuth);

// ─── ДАШБОРД ─────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now - 7 * 86400000).toISOString().split('T')[0];
  const monthAgo = new Date(now - 30 * 86400000).toISOString().split('T')[0];

  const visitsToday = db.prepare("SELECT COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)=date('now')").get().c;
  const visitsWeek = db.prepare("SELECT COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)>=?").get(weekAgo).c;
  const visitsMonth = db.prepare("SELECT COUNT(DISTINCT session_id) c FROM visits WHERE date(created_at)>=?").get(monthAgo).c;

  const newLeads = db.prepare("SELECT COUNT(*) c FROM leads WHERE status='new'").get().c;
  const totalLeads = db.prepare("SELECT COUNT(*) c FROM leads").get().c;

  const topPages = db.prepare(`
    SELECT page, COUNT(*) cnt FROM visits
    WHERE date(created_at)>=? GROUP BY page ORDER BY cnt DESC LIMIT 5
  `).all(weekAgo);

  const recentLeads = db.prepare(`
    SELECT * FROM leads ORDER BY created_at DESC LIMIT 5
  `).all();

  const chartData = db.prepare(`
    SELECT date(created_at) d, COUNT(DISTINCT session_id) c
    FROM visits WHERE date(created_at)>=?
    GROUP BY d ORDER BY d
  `).all(weekAgo);

  const deviceStats = db.prepare(`
    SELECT device, COUNT(*) c FROM visits
    WHERE date(created_at)>=? GROUP BY device
  `).all(weekAgo);

  res.json({
    stats: { visitsToday, visitsWeek, visitsMonth, newLeads, totalLeads },
    topPages,
    recentLeads,
    chartData,
    deviceStats
  });
});

// ─── ТОВАРЫ ──────────────────────────────────────────────────────────────────
router.get('/products', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order, id DESC').all();
  res.json(products);
});

router.post('/products', (req, res) => {
  const db = getDb();
  const { name, description, price, category, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Название обязательно' });

  const result = db.prepare(`
    INSERT INTO products (name, description, price, category, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, description || '', parseInt(price) || 0, category || 'other', status || 'available');

  logAction(db, 'product_create', `Создан товар: ${name}`, req);
  res.json({ id: result.lastInsertRowid });
});

router.put('/products/:id', (req, res) => {
  const db = getDb();
  const { name, description, price, category, status, sort_order } = req.body;

  db.prepare(`
    UPDATE products SET name=?, description=?, price=?, category=?, status=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, description || '', parseInt(price) || 0, category || 'other', status || 'available', parseInt(sort_order) || 0, req.params.id);

  logAction(db, 'product_update', `Обновлён товар ID ${req.params.id}: ${name}`, req);
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (product && product.image) {
    const imgPath = path.join(__dirname, '..', 'public', product.image);
    try { fs.unlinkSync(imgPath); } catch (e) {}
  }
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  logAction(db, 'product_delete', `Удалён товар ID ${req.params.id}`, req);
  res.json({ ok: true });
});

// Загрузка фото товара
router.post('/products/:id/image', (req, res) => {
  if (!req.files || !req.files.image) return res.status(400).json({ error: 'Нет файла' });
  const db = getDb();
  const file = req.files.image;
  const ext = path.extname(file.name).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext))
    return res.status(400).json({ error: 'Только JPG/PNG/WEBP' });

  const filename = `product_${req.params.id}_${Date.now()}${ext}`;
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
  const uploadPath = path.join(DATA_DIR, 'public', 'uploads', filename);

  file.mv(uploadPath, (err) => {
    if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
    const imgUrl = `/uploads/${filename}`;
    db.prepare('UPDATE products SET image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(imgUrl, req.params.id);
    logAction(db, 'product_image', `Загружено фото для товара ID ${req.params.id}`, req);
    res.json({ url: imgUrl });
  });
});

// ─── ЗАЯВКИ ──────────────────────────────────────────────────────────────────
router.get('/leads', (req, res) => {
  const db = getDb();
  const { status, from, to, limit = 100, offset = 0 } = req.query;
  let query = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (status) { query += ' AND status=?'; params.push(status); }
  if (from) { query += ' AND date(created_at)>=?'; params.push(from); }
  if (to) { query += ' AND date(created_at)<=?'; params.push(to); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const leads = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
  res.json({ leads, total });
});

router.post('/leads', (req, res) => {
  // Публичный эндпоинт для приёма заявок с сайта
  const db = getDb();
  const { name, phone, message, source } = req.body;
  if (!phone) return res.status(400).json({ error: 'Телефон обязателен' });

  const result = db.prepare(`
    INSERT INTO leads (name, phone, message, source) VALUES (?, ?, ?, ?)
  `).run(name || '', phone, message || '', source || 'site');

  // Email-уведомление
  sendEmailNotification({ name, phone, message }).catch(() => {});

  res.json({ id: result.lastInsertRowid, ok: true });
});

router.put('/leads/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  const allowed = ['new', 'working', 'done', 'rejected'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });

  db.prepare('UPDATE leads SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, req.params.id);
  logAction(db, 'lead_status', `Заявка ID ${req.params.id} → ${status}`, req);
  res.json({ ok: true });
});

router.delete('/leads/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  logAction(db, 'lead_delete', `Удалена заявка ID ${req.params.id}`, req);
  res.json({ ok: true });
});

// Экспорт CSV
router.get('/leads/export', (req, res) => {
  const db = getDb();
  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  const header = 'ID,Имя,Телефон,Сообщение,Статус,Дата\n';
  const rows = leads.map(l =>
    [l.id, `"${l.name}"`, `"${l.phone}"`, `"${(l.message || '').replace(/"/g, '""')}"`, l.status, l.created_at].join(',')
  ).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send('\uFEFF' + header + rows);
});

// ─── НАСТРОЙКИ ───────────────────────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

router.post('/settings', (req, res) => {
  const db = getDb();
  const allowed = ['phone', 'address', 'email', 'vk', 'telegram', 'whatsapp', 'site_name', 'site_tagline', 'banner_active', 'banner_title', 'banner_text'];
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      update.run(key, req.body[key]);
    }
  }
  logAction(db, 'settings_update', 'Обновлены настройки сайта', req);
  res.json({ ok: true });
});

// ─── ОТЗЫВЫ ──────────────────────────────────────────────────────────────────
router.get('/reviews', (req, res) => {
  const db = getDb();
  const reviews = db.prepare('SELECT * FROM reviews ORDER BY created_at DESC').all();
  res.json(reviews);
});

router.put('/reviews/:id/status', (req, res) => {
  const db = getDb();
  const { status } = req.body;
  db.prepare('UPDATE reviews SET status=? WHERE id=?').run(status, req.params.id);
  logAction(db, 'review_moderate', `Отзыв ID ${req.params.id} → ${status}`, req);
  res.json({ ok: true });
});

router.delete('/reviews/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM reviews WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Публичный эндпоинт для добавления отзыва
router.post('/reviews/submit', (req, res) => {
  const db = getDb();
  const { author, text, rating } = req.body;
  if (!author || !text) return res.status(400).json({ error: 'Заполните все поля' });
  db.prepare('INSERT INTO reviews (author, text, rating) VALUES (?, ?, ?)').run(author, text, parseInt(rating) || 5);
  res.json({ ok: true });
});

// ─── ПОРТФОЛИО ───────────────────────────────────────────────────────────────
router.get('/portfolio', (req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM portfolio ORDER BY sort_order, id DESC').all();
  res.json(items);
});

router.post('/portfolio', (req, res) => {
  if (!req.files || !req.files.image) return res.status(400).json({ error: 'Нет файла' });
  const db = getDb();
  const file = req.files.image;
  const ext = path.extname(file.name).toLowerCase();
  const filename = `portfolio_${Date.now()}${ext}`;
  const uploadPath = path.join(__dirname, '..', 'public', 'uploads', filename);

  file.mv(uploadPath, (err) => {
    if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
    const result = db.prepare('INSERT INTO portfolio (title, description, image) VALUES (?, ?, ?)').run(
      req.body.title || 'Работа', req.body.description || '', `/uploads/${filename}`
    );
    logAction(db, 'portfolio_add', `Добавлено в портфолио: ${req.body.title}`, req);
    res.json({ id: result.lastInsertRowid });
  });
});

router.delete('/portfolio/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM portfolio WHERE id=?').get(req.params.id);
  if (item && item.image) {
    const imgPath = path.join(__dirname, '..', 'public', item.image);
    try { fs.unlinkSync(imgPath); } catch (e) {}
  }
  db.prepare('DELETE FROM portfolio WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── FAQ ─────────────────────────────────────────────────────────────────────
router.get('/faq', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM faq ORDER BY sort_order, id').all());
});

router.post('/faq', (req, res) => {
  const db = getDb();
  const { question, answer } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'Заполните вопрос и ответ' });
  const result = db.prepare('INSERT INTO faq (question, answer) VALUES (?, ?)').run(question, answer);
  res.json({ id: result.lastInsertRowid });
});

router.put('/faq/:id', (req, res) => {
  const db = getDb();
  const { question, answer, active } = req.body;
  db.prepare('UPDATE faq SET question=?, answer=?, active=? WHERE id=?').run(question, answer, active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/faq/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM faq WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── SEO ─────────────────────────────────────────────────────────────────────
router.get('/seo', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM seo').all());
});

router.post('/seo', (req, res) => {
  const db = getDb();
  const { page, title, description, keywords } = req.body;
  db.prepare('INSERT OR REPLACE INTO seo (page, title, description, keywords, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
    .run(page || '/', title || '', description || '', keywords || '');
  logAction(db, 'seo_update', `SEO обновлён для ${page}`, req);
  res.json({ ok: true });
});

// ─── СТАТИСТИКА ──────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();
  const days = parseInt(req.query.days) || 30;
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const byDay = db.prepare(`
    SELECT date(created_at) d, COUNT(DISTINCT session_id) c
    FROM visits WHERE date(created_at)>=? GROUP BY d ORDER BY d
  `).all(from);

  const byPage = db.prepare(`
    SELECT page, COUNT(*) c FROM visits
    WHERE date(created_at)>=? GROUP BY page ORDER BY c DESC LIMIT 10
  `).all(from);

  const byDevice = db.prepare(`
    SELECT device, COUNT(*) c FROM visits
    WHERE date(created_at)>=? GROUP BY device
  `).all(from);

  const byReferer = db.prepare(`
    SELECT referer, COUNT(*) c FROM visits
    WHERE date(created_at)>=? AND referer!='' GROUP BY referer ORDER BY c DESC LIMIT 10
  `).all(from);

  res.json({ byDay, byPage, byDevice, byReferer });
});

// ─── КАЛЬКУЛЯТОР ─────────────────────────────────────────────────────────────
router.get('/calculator', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM calculator').all());
});

router.post('/calculator', (req, res) => {
  const db = getDb();
  const update = db.prepare('UPDATE calculator SET value=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
  for (const [id, value] of Object.entries(req.body)) {
    update.run(parseFloat(value) || 0, id);
  }
  logAction(db, 'calculator_update', 'Обновлены коэффициенты калькулятора', req);
  res.json({ ok: true });
});

// ─── ЛОГ ─────────────────────────────────────────────────────────────────────
router.get('/log', (req, res) => {
  const db = getDb();
  const log = db.prepare('SELECT * FROM admin_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(log);
});

// ─── БЭКАП ───────────────────────────────────────────────────────────────────
router.get('/backup', (req, res) => {
  const dbPath = path.join(__dirname, '..', 'db', 'mebel.db');
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'БД не найдена' });
  logAction(getDb(), 'backup', 'Скачан бэкап БД', req);
  res.download(dbPath, `mebel_backup_${new Date().toISOString().split('T')[0]}.db`);
});

// ─── EMAIL ───────────────────────────────────────────────────────────────────
async function sendEmailNotification({ name, phone, message }) {
  if (!process.env.SMTP_USER || !process.env.NOTIFY_EMAIL) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: '🛋️ Новая заявка с сайта Мебель на заказ',
    text: `Новая заявка!\n\nИмя: ${name || '—'}\nТелефон: ${phone}\nСообщение: ${message || '—'}`,
    html: `<h2>Новая заявка с сайта</h2><p><b>Имя:</b> ${name || '—'}</p><p><b>Телефон:</b> ${phone}</p><p><b>Сообщение:</b> ${message || '—'}</p>`
  });
}

module.exports = router;
