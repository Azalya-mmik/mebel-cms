// Публичный API сайта — БЕЗ авторизации.
// Сюда обращается фронт сайта: настройки, приём заявок, приём отзывов.
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { getDb } = require('../db/init');

// ─── НАСТРОЙКИ САЙТА (телефон, VK, баннер) + FAQ + портфолио ───────────────────
router.get('/public/config', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;

    const faq = db
      .prepare('SELECT question, answer FROM faq WHERE active=1 ORDER BY sort_order, id')
      .all();

    const portfolio = db
      .prepare('SELECT title, description, image FROM portfolio ORDER BY sort_order, id DESC')
      .all();

    const categories = db
      .prepare('SELECT name, slug, cover_image, delivery_price, delivery_free_from FROM categories WHERE active=1 ORDER BY sort_order, id')
      .all();

    const reviews = db
      .prepare("SELECT author, text, rating, created_at FROM reviews WHERE status='approved' ORDER BY created_at DESC LIMIT 12")
      .all();

    const calcRows = db.prepare("SELECT id, value FROM calculator").all();
    const calc = {};
    for (const r of calcRows) calc[r.id] = r.value;
    const delivery = {
      bed: calc.delivery_base != null ? calc.delivery_base : 1500,
      chair: calc.chair_delivery != null ? calc.chair_delivery : 200,
      chairFreeFrom: calc.chair_free_from != null ? calc.chair_free_from : 4,
      freeFromOrderTotal: calc.free_delivery_order_total != null ? calc.free_delivery_order_total : 0,
    };

    res.json({ settings, faq, portfolio, categories, reviews, delivery });
  } catch (e) {
    res.status(500).json({ error: 'config_error' });
  }
});

// ─── КАТАЛОГ ТОВАРОВ ДЛЯ САЙТА ────────────────────────────────────────────────
router.get('/public/products', (req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM products WHERE status != 'hidden' ORDER BY sort_order, id")
      .all();
    const parse = (v, def) => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : def; } catch (e) { return def; } };
    const products = rows.map(p => ({
      id: p.id,
      type: p.category || 'Прочее',
      name: p.name,
      cost: p.price || 0,
      costRot: (p.cost_rot != null ? p.cost_rot : null),
      desc: p.description || '',
      inStock: p.status === 'available',
      imgs: (() => { const a = parse(p.images, null); return (a && a.length) ? a : (p.image ? [p.image] : []); })(),
      specs: parse(p.specs, []),
      colors: parse(p.colors, []),
    }));
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: 'products_error' });
  }
});

// ─── ПРОМОКОД: проверка кода с сайта (без авторизации) ────────────────────────
router.post('/public/promo/check', (req, res) => {
  try {
    const db = getDb();
    const code = String((req.body || {}).code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return res.json({ valid: false });
    const promo = db.prepare('SELECT * FROM promo_codes WHERE code=? AND active=1').get(code);
    if (!promo) return res.json({ valid: false });
    res.json({ valid: true, discount_percent: promo.discount_percent });
  } catch (e) {
    res.json({ valid: false });
  }
});

// ─── ПРИЁМ ЗАЯВКИ С САЙТА ─────────────────────────────────────────────────────
router.post('/public/lead', (req, res) => {
  try {
    const db = getDb();
    const { name, phone, message, source, promo_code } = req.body || {};
    // Достаточно телефона ИЛИ имени — не теряем контакт
    if (!phone && !name) {
      return res.status(400).json({ error: 'Укажите телефон или имя' });
    }

    // Если пришёл промокод — проверяем его ещё раз на сервере (не доверяем фронту)
    // и сохраняем снимок (код/партнёр/скидка), чтобы статистика не менялась,
    // если промокод потом отредактируют или удалят.
    let promoRow = null;
    if (promo_code) {
      const code = String(promo_code).trim().toUpperCase().replace(/\s+/g, '');
      promoRow = db.prepare('SELECT * FROM promo_codes WHERE code=? AND active=1').get(code);
    }

    const result = db
      .prepare(`INSERT INTO leads
        (name, phone, message, source, promo_code, promo_partner, promo_discount_percent)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        name || '', phone || '', message || '', source || 'Сайт R&T',
        promoRow ? promoRow.code : null,
        promoRow ? promoRow.partner_name : null,
        promoRow ? promoRow.discount_percent : null,
      );

    sendLeadEmail({ name, phone, message }).catch(() => {});
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: 'lead_error' });
  }
});

// ─── ПРИЁМ ОТЗЫВА С САЙТА (на модерацию) ──────────────────────────────────────
router.post('/public/review', (req, res) => {
  try {
    const db = getDb();
    const { author, text, rating } = req.body || {};
    if (!author || !text) return res.status(400).json({ error: 'Заполните имя и отзыв' });
    db.prepare("INSERT INTO reviews (author, text, rating, status) VALUES (?, ?, ?, 'pending')")
      .run(author, text, parseInt(rating) || 5);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'review_error' });
  }
});

// Email-уведомление о заявке (если настроен SMTP в переменных окружения)
async function sendLeadEmail({ name, phone, message }) {
  if (!process.env.SMTP_USER || !process.env.NOTIFY_EMAIL) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: '🪑 Новая заявка с сайта R&T Мебель',
    text: `Новая заявка!\n\nИмя: ${name || '—'}\nТелефон: ${phone || '—'}\n\n${message || ''}`,
    html: `<h2>Новая заявка с сайта R&T</h2><p><b>Имя:</b> ${name || '—'}</p><p><b>Телефон:</b> ${phone || '—'}</p><pre style="font:14px/1.5 system-ui;white-space:pre-wrap">${(message || '').replace(/</g, '&lt;')}</pre>`,
  });
}

module.exports = router;
