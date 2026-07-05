// scripts/migrate-base64-images.js
//
// Разовая миграция: находит товары, у которых фото ещё хранятся как base64
// (data:image/...;base64,...) прямо в базе — обычно это осталось от исходного
// seed-catalog.json — и превращает их в обычные файлы в /public/uploads,
// как это уже делает загрузка фото из админки. В базе остаётся только ссылка.
//
// Зачем: base64-фото в ответе GET /api/public/products раздувают каждый
// запрос на десятки/сотни КБ и делают каталог непригодным для передачи в AI
// (съедает контекст/токены). После миграции там всегда будут только URL.
//
// Запуск (на сервере или локально с той же базой):
//   node scripts/migrate-base64-images.js
//
// Скрипт безопасен для повторного запуска: товары, где фото уже ссылки,
// просто пропускаются.

const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/init');
const s3sync = require('../db/s3sync');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'public', 'uploads');

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

// Разбирает "data:image/jpeg;base64,/9j/4AAQ..." -> { ext, buffer } или null,
// если строка не является base64-картинкой (например, это уже /uploads/... URL).
function decodeDataUri(str) {
  if (typeof str !== 'string' || !str.startsWith('data:image/')) return null;
  const match = str.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!match) return null;
  const [, mime, base64] = match;
  const ext = MIME_TO_EXT[mime.toLowerCase()] || '.jpg';
  try {
    return { ext, buffer: Buffer.from(base64, 'base64') };
  } catch (e) {
    return null;
  }
}

function parseJsonArray(v) {
  if (!v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

async function migrateProduct(db, product) {
  const images = parseJsonArray(product.images);
  const sourceList = images.length ? images : (product.image ? [product.image] : []);

  let changed = false;
  const newImages = [];

  for (let i = 0; i < sourceList.length; i++) {
    const item = sourceList[i];
    const decoded = decodeDataUri(item);

    if (!decoded) {
      // Уже ссылка (или что-то нераспознанное) — оставляем как есть.
      newImages.push(item);
      continue;
    }

    changed = true;
    const filename = `migrated_${product.id}_${Date.now()}_${i}${decoded.ext}`;
    const localPath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(localPath, decoded.buffer);

    // Не блокируем миграцию, если S3 недоступен — просто предупредим.
    try {
      await s3sync.uploadImage(localPath, filename);
    } catch (e) {
      console.warn(`  ⚠️  Товар ${product.id}: не удалось выгрузить фото в S3 (${e.message})`);
    }

    newImages.push(`/uploads/${filename}`);
  }

  if (!changed) return false;

  db.prepare(
    'UPDATE products SET image = ?, images = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(newImages[0] || null, JSON.stringify(newImages), product.id);

  console.log(`  ✅ Товар ${product.id} ("${product.name}"): ${sourceList.length} фото переведено в файлы`);
  return true;
}

async function main() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const db = getDb();
  const products = db.prepare('SELECT id, name, image, images FROM products').all();

  console.log(`Найдено товаров: ${products.length}. Проверяю фото...`);

  let migratedCount = 0;
  for (const product of products) {
    const didMigrate = await migrateProduct(db, product);
    if (didMigrate) migratedCount++;
  }

  if (migratedCount === 0) {
    console.log('✅ Base64-фото не найдено — миграция не потребовалась.');
  } else {
    console.log(`✅ Готово. Обновлено товаров: ${migratedCount}.`);
  }

  // Синхронизировать обновлённую базу с S3, если он настроен (как после обычной правки в админке).
  s3sync.markDirty();
  await s3sync.upload();

  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Ошибка миграции:', e);
  process.exit(1);
});
