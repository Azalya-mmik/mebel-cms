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

// ─── КАЛЬКУЛЯТОР ЦЕНЫ ─────────────────────────────────────────
// Вычисляет стоимость товара с учётом материала, фурнитуры, доставки.
// Params (query или body):
//   productId (обяз.) - id товара
//   quantity (опц., дефолт 1) - количество
//   material (опц.) - oak/pine/mdf (применяет коэффициент)
//   hardware (опц.) - premium/standard (применяет коэффициент)
//   includeDelivery (опц., дефолт true) - считать ли доставку
//   promoDiscountPercent (опц., дефолт 0) - процент скидки по промокоду
//
// Возвращает:
//   {
//     productId, name, basePrice, quantity,
//     materialCoef, hardwareCoef, costRot,
//     subtotal (с коэфф. и доп. опциями),
//     deliveryPrice (стоимость доставки или 0),
//     promoDiscount (сумма скидки),
//     total (финальная сумма)
//   }
router.get('/calculate-price', (req, res) => {
  try {
    const db = getDb();
    const productId = parseInt(req.query.productId || req.body?.productId);
    const quantity = Math.max(1, parseInt(req.query.quantity || req.body?.quantity || 1));
    const material = (req.query.material || req.body?.material || '').toLowerCase();
    const hardware = (req.query.hardware || req.body?.hardware || '').toLowerCase();
    const includeDelivery = req.query.includeDelivery !== 'false' && req.body?.includeDelivery !== false;
    const promoDiscountPercent = Math.max(0, Math.min(100, parseInt(req.query.promoDiscountPercent || req.body?.promoDiscountPercent || 0)));

    if (!productId || isNaN(productId)) {
      return res.status(400).json({ error: 'missing_product_id' });
    }

    // Берём товар и категорию
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) {
      return res.status(404).json({ error: 'product_not_found' });
    }

    const category = db.prepare('SELECT delivery_price, delivery_free_from FROM categories WHERE name = ?').get(product.category);

    // Загружаем коэффициенты
    const getCoef = (id) => {
      const row = db.prepare('SELECT value FROM calculator WHERE id = ?').get(id);
      return row ? parseFloat(row.value) : 1.0;
    };

    let basePrice = product.price || 0;
    let materialCoef = 1.0;
    let hardwareCoef = 1.0;
    let costRot = product.cost_rot || 0;

    // Материал
    if (material === 'oak') materialCoef = getCoef('coef_oak');
    else if (material === 'pine') materialCoef = getCoef('coef_pine');
    else if (material === 'mdf') materialCoef = getCoef('coef_mdf');

    // Фурнитура
    if (hardware === 'premium') hardwareCoef = getCoef('coef_premium');
    else if (hardware === 'standard') hardwareCoef = getCoef('coef_standard');

    // Цена за одну единицу (с коэффициентами)
    const pricePerUnit = basePrice * materialCoef * hardwareCoef + costRot;
    const subtotal = pricePerUnit * quantity;

    // Доставка
    let deliveryPrice = 0;
    if (includeDelivery && category) {
      const catDeliveryPrice = category.delivery_price || 0;
      const freeFrom = category.delivery_free_from || null;
      // Доставка бесплатна, если кол-во >= freeFrom
      if (freeFrom === null || quantity < freeFrom) {
        deliveryPrice = catDeliveryPrice * quantity;
      }
    }

    // Скидка по промокоду
    const promoDiscount = Math.floor(subtotal * promoDiscountPercent / 100);

    // Итого
    const total = subtotal + deliveryPrice - promoDiscount;

    res.json({
      productId,
      name: product.name,
      basePrice,
      quantity,
      materialCoef,
      hardwareCoef,
      costRot,
      subtotal: Math.round(subtotal),
      deliveryPrice: Math.round(deliveryPrice),
      promoDiscount,
      total: Math.round(total),
    });
  } catch (e) {
    console.error('calculate-price error:', e);
    res.status(500).json({ error: 'calculate_price_error' });
  }
});

module.exports = router;
