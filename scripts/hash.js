// Генерация bcrypt-хеша пароля для входа в админку.
// Запуск:  node scripts/hash.js ТВОЙ_ПАРОЛЬ
// Полученный хеш вставь в переменную окружения ADMIN_PASSWORD_HASH на Timeweb.
const bcrypt = require('bcryptjs');
const pw = process.argv[2];
if (!pw) { console.error('Использование: node scripts/hash.js ТВОЙ_ПАРОЛЬ'); process.exit(1); }
bcrypt.hash(pw, 10).then(h => console.log(h));
