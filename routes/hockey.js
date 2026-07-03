// routes/hockey.js
// Личный дневник хоккеиста — Дашборд + Режим дня (этап 1).
// Использует ту же базу (better-sqlite3), что и весь сайт — значит, данные
// автоматически сохраняются в S3 через существующий db/s3sync.js
// (см. server.js: app.use('/api', ...) уже помечает базу "грязной" после
// любого не-GET запроса к /api — ничего дополнительно настраивать не нужно).
//
// Подключение в server.js (добавить рядом с другими роутами):
//   const hockeyRouter = require('./routes/hockey');
//   app.use('/api/hockey', requireAuth, hockeyRouter);
//
// requireAuth уже есть в middleware/auth.js — так дневник закрыт тем же
// логином, что и админка сайта.

const express = require('express');
const { getDb } = require('../db/init');

const router = express.Router();

// ── Таблицы дневника (создаются один раз при первом обращении) ──
function ensureTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS hockey_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS hockey_days (
      date TEXT PRIMARY KEY,
      weight REAL,
      sleep_hours REAL,
      energy INTEGER,
      motivation INTEGER,
      fatigue INTEGER,
      mood TEXT,
      morning_pulse INTEGER,
      water REAL,
      calories INTEGER,
      protein INTEGER,
      tasks_done INTEGER,
      note TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hockey_routine_template (
      id TEXT PRIMARY KEY,
      time TEXT,
      title TEXT,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hockey_routine_checks (
      date TEXT,
      item_id TEXT,
      checked INTEGER DEFAULT 1,
      PRIMARY KEY (date, item_id)
    );
  `);

  const count = db.prepare('SELECT COUNT(*) c FROM hockey_routine_template').get();
  if (count.c === 0) {
    const ins = db.prepare('INSERT INTO hockey_routine_template (id, time, title, sort_order) VALUES (?,?,?,?)');
    const defaults = [
      ['r1', '07:00', 'Подъём'], ['r2', '07:10', 'Вода'], ['r3', '07:20', 'Зарядка'],
      ['r4', '07:40', 'Завтрак'], ['r5', '08:30', 'Лёд'], ['r6', '11:00', 'Зал'],
      ['r7', '13:00', 'Обед'], ['r8', '15:00', 'Дневной сон'], ['r9', '17:00', 'Теория'],
      ['r10', '18:00', 'Вечерняя тренировка'], ['r11', '20:00', 'Ужин'], ['r12', '22:30', 'Отбой'],
    ];
    defaults.forEach(([id, time, title], i) => ins.run(id, time, title, i));
  }
  const settingsCount = db.prepare('SELECT COUNT(*) c FROM hockey_settings').get();
  if (settingsCount.c === 0) {
    const ins = db.prepare('INSERT INTO hockey_settings (key, value) VALUES (?,?)');
    ins.run('target_weight', '72');
    ins.run('season_start', '');
  }
}
router.use((req, res, next) => { ensureTables(); next(); });

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---------- Настройки ----------

router.get('/settings', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM hockey_settings').all();
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  res.json(out);
});

router.put('/settings', (req, res) => {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO hockey_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  Object.entries(req.body || {}).forEach(([k, v]) => upsert.run(k, String(v)));
  res.json({ ok: true });
});

// ---------- Шаблон режима дня ----------

router.get('/routine-template', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM hockey_routine_template ORDER BY sort_order, time').all();
  res.json(rows);
});

router.put('/routine-template', (req, res) => {
  const db = getDb();
  const items = Array.isArray(req.body) ? req.body : [];
  const del = db.prepare('DELETE FROM hockey_routine_template');
  const ins = db.prepare('INSERT INTO hockey_routine_template (id, time, title, sort_order) VALUES (?,?,?,?)');
  const tx = db.transaction((list) => {
    del.run();
    list.forEach((it, i) => ins.run(it.id || uid(), it.time || '', it.title || '', i));
  });
  tx(items);
  res.json({ ok: true });
});

// ---------- День (дашборд + чек-лист режима) ----------

router.get('/day/:date', (req, res) => {
  const db = getDb();
  const date = req.params.date;
  const day = db.prepare('SELECT * FROM hockey_days WHERE date = ?').get(date) || { date };
  const template = db.prepare('SELECT * FROM hockey_routine_template ORDER BY sort_order, time').all();
  const checks = db.prepare('SELECT item_id FROM hockey_routine_checks WHERE date = ? AND checked = 1').all(date);
  const checkedSet = new Set(checks.map(c => c.item_id));
  const routine = template.map(t => ({ ...t, checked: checkedSet.has(t.id) }));
  res.json({ ...day, routine });
});

router.put('/day/:date', (req, res) => {
  const db = getDb();
  const date = req.params.date;
  const b = req.body || {};
  const fields = ['weight', 'sleep_hours', 'energy', 'motivation', 'fatigue', 'mood',
    'morning_pulse', 'water', 'calories', 'protein', 'tasks_done', 'note'];
  const existing = db.prepare('SELECT date FROM hockey_days WHERE date = ?').get(date);
  if (existing) {
    const sets = fields.filter(f => f in b).map(f => `${f} = @${f}`).join(', ');
    if (sets) {
      db.prepare(`UPDATE hockey_days SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE date = @date`)
        .run({ ...b, date });
    }
  } else {
    const cols = ['date', ...fields];
    const placeholders = cols.map(c => `@${c}`).join(', ');
    const payload = { date };
    fields.forEach(f => { payload[f] = f in b ? b[f] : null; });
    db.prepare(`INSERT INTO hockey_days (${cols.join(', ')}) VALUES (${placeholders})`).run(payload);
  }
  const day = db.prepare('SELECT * FROM hockey_days WHERE date = ?').get(date);
  res.json(day);
});

router.post('/day/:date/routine/:itemId/toggle', (req, res) => {
  const db = getDb();
  const { date, itemId } = req.params;
  const existing = db.prepare('SELECT * FROM hockey_routine_checks WHERE date = ? AND item_id = ?').get(date, itemId);
  if (existing) {
    const next = existing.checked ? 0 : 1;
    db.prepare('UPDATE hockey_routine_checks SET checked = ? WHERE date = ? AND item_id = ?').run(next, date, itemId);
    res.json({ checked: !!next });
  } else {
    db.prepare('INSERT INTO hockey_routine_checks (date, item_id, checked) VALUES (?, ?, 1)').run(date, itemId);
    res.json({ checked: true });
  }
});

// ---------- Список дней (для будущих графиков) + стрик ----------

router.get('/days', (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  let sql = 'SELECT * FROM hockey_days';
  const params = [];
  if (from && to) { sql += ' WHERE date >= ? AND date <= ?'; params.push(from, to); }
  else if (from) { sql += ' WHERE date >= ?'; params.push(from); }
  else if (to) { sql += ' WHERE date <= ?'; params.push(to); }
  sql += ' ORDER BY date';
  res.json(db.prepare(sql).all(...params));
});

router.get('/streak', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT date FROM hockey_days ORDER BY date DESC').all();
  const dates = new Set(rows.map(r => r.date));
  let streak = 0;
  let cursor = new Date();
  // если сегодня ещё не заполнено — считаем стрик со вчера
  const todayStr = cursor.toISOString().slice(0, 10);
  if (!dates.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const ds = cursor.toISOString().slice(0, 10);
    if (dates.has(ds)) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  res.json({ streak });
});

module.exports = router;
