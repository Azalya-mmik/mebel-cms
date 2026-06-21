// Публичный API сайта — БЕЗ авторизации.
// Сюда обращается фронт сайта: настройки, приём заявок, приём отзывов.
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { getDb } = require('../db/init');

// ─── НАСТРОЙКИ САЙТА (телефон, VK, баннер) + отзывы + FAQ ──────────────────────
router.get('/public/config', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;

    const reviews = db
      .prepare("SELECT author, text, rating, created_at FROM reviews WHERE status='approved' ORDER BY created_at DESC LIMIT 30")
      .all();

    const faq = db
      .prepare('SELECT question, answer FROM faq WHERE active=1 ORDER BY sort_order, id')
      .all();

    res.json({ settings, reviews, faq });
  } catch (e) {
    res.status(500).json({ error: 'config_error' });
  }
});

// ─── ПРИЁМ ЗАЯВКИ С САЙТА ─────────────────────────────────────────────────────
router.post('/public/lead', (req, res) => {
  try {
    const db = getDb();
    const { name, phone, message, source } = req.body || {};
    // Достаточно телефона ИЛИ имени — не теряем контакт
    if (!phone && !name) {
      return res.status(400).json({ error: 'Укажите телефон или имя' });
    }
    const result = db
      .prepare('INSERT INTO leads (name, phone, message, source) VALUES (?, ?, ?, ?)')
      .run(name || '', phone || '', message || '', source || 'Сайт R&T');

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
