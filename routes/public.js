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

    res.json({ settings, faq, portfolio });
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

// ─── ПРИЁМ ЗАЯВКИ С САЙТА ─────────────────────────────────────────────────────
router.post('/public/lead', (req, res) => {
  try {
    const db = getDb();
    const { name, phone, message, source, promo_code, order_amount, product_name } = req.body || {};
    if (!phone && !name) {
      return res.status(400).json({ error: 'Укажите телефон или имя' });
    }
    const result = db
      .prepare('INSERT INTO leads (name, phone, message, source) VALUES (?, ?, ?, ?)')
      .run(name || '', phone || '', message || '', source || 'Сайт R&T');

    const leadId = result.lastInsertRowid;

    // Если передан промокод — зафиксировать использование
    let promoInfo = null;
    if (promo_code) {
      const promo = db.prepare("SELECT * FROM promo_codes WHERE upper(code)=upper(?) AND active=1").get(promo_code);
      if (promo) {
        const amount = parseInt(order_amount) || 0;
        const reward = Math.round(amount * promo.discount_pct / 100);
        db.prepare(
          'INSERT INTO promo_usages (promo_id, lead_id, order_amount, reward_amount, product_name) VALUES (?, ?, ?, ?, ?)'
        ).run(promo.id, leadId, amount, reward, product_name || '');
        promoInfo = { partner: promo.partner_name, discount_pct: promo.discount_pct, reward };

        // Уведомление партнёру в Telegram
        sendTelegramNotify(promo, { product_name, amount, reward }).catch(() => {});
      }
    }

    sendLeadEmail({ name, phone, message }).catch(() => {});
    res.json({ ok: true, id: leadId, promo: promoInfo });
  } catch (e) {
    res.status(500).json({ error: 'lead_error' });
  }
});

// ─── ПРОВЕРКА ПРОМОКОДА ────────────────────────────────────────────────────────
router.post('/public/promo/check', (req, res) => {
  try {
    const db = getDb();
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Не указан промокод' });
    const promo = db.prepare("SELECT id, code, partner_name, discount_pct FROM promo_codes WHERE upper(code)=upper(?) AND active=1").get(code);
    if (!promo) return res.json({ valid: false });
    res.json({ valid: true, discount_pct: promo.discount_pct, partner_name: promo.partner_name });
  } catch (e) {
    res.status(500).json({ error: 'promo_error' });
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

// Telegram-уведомление партнёру (если у промокода задан telegram_chat_id и задан TELEGRAM_BOT_TOKEN)
async function sendTelegramNotify(promo, { product_name, amount, reward }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = promo.telegram_chat_id;
  if (!token || !chatId) return;
  const product = product_name || 'товар';
  const text =
    `🎉 Марат должен вам за промокод *${promo.code}* по товару «${product}» — ` +
    `${promo.discount_pct}% от суммы заказа = *${reward.toLocaleString('ru-RU')} ₽*`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

module.exports = router;
