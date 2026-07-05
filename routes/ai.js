// routes/ai.js
// Публичный API специально для AI-продавца (без авторизации, как и routes/public.js).
// Отличие от /api/public/products: здесь гарантированно нет base64 — только
// компактные поля и ссылки на фото. Даже если в базе где-то снова окажется
// data:-строка (например, кто-то руками вставит фото в старом формате),
// sanitizeImages() её просто отфильтрует, а не пропустит в ответ.
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');

function parseJsonArray(v, fallback) {
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr : fallback;
  } catch (e) {
    return fallback;
  }
}

// Оставляет только настоящие ссылки на файлы, base64 отбрасывает.
function sanitizeImages(list) {
  return (list || []).filter(
    (u) => typeof u === 'string' && u.length < 300 && !u.startsWith('data:')
  );
}

// ─── КАТАЛОГ ДЛЯ AI (лёгкий, без фото-блобов) ─────────────────────────────
router.get('/products', (req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM products WHERE status != 'hidden' ORDER BY sort_order, id")
      .all();

    const products = rows.map((p) => {
      const imagesRaw = parseJsonArray(p.images, p.image ? [p.image] : []);
      const images = sanitizeImages(imagesRaw);

      return {
        id: p.id,
        name: p.name,
        category: p.category || 'Прочее',
        description: p.description || '',
        price: p.price || 0,
        priceRotationOption: p.cost_rot != null ? p.cost_rot : null,
        inStock: p.status === 'available',
        specs: parseJsonArray(p.specs, []),
        colors: parseJsonArray(p.colors, []),
        // Не сама картинка, а ссылка — AI при необходимости может отдать её
        // клиенту как url, но никогда не носит с собой байты фото.
        photoUrl: images[0] || null,
        photoCount: images.length,
      };
    });

    res.json({ products, count: products.length });
  } catch (e) {
    res.status(500).json({ error: 'ai_products_error' });
  }
});

// Список категорий — то же самое, что видит сайт, без лишнего.
router.get('/categories', (req, res) => {
  try {
    const db = getDb();
    const categories = db
      .prepare(
        'SELECT name, slug, delivery_price, delivery_free_from FROM categories WHERE active=1 ORDER BY sort_order, id'
      )
      .all();
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: 'ai_categories_error' });
  }
});

// FAQ для базы знаний AI.
router.get('/faq', (req, res) => {
  try {
    const db = getDb();
    const faq = db
      .prepare('SELECT question, answer FROM faq WHERE active=1 ORDER BY sort_order, id')
      .all();
    res.json({ faq });
  } catch (e) {
    res.status(500).json({ error: 'ai_faq_error' });
  }
});

module.exports = router;
