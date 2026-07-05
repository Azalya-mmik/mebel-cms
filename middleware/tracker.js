const { getDb } = require('../db/init');

// Известные пути автосканеров уязвимостей (WordPress, PHP-панели, git-утечки и т.п.).
// На нашем Node.js-сайте таких файлов нет и быть не может — запрос к ним однозначно бот.
const BOT_PATH_PATTERNS = [
  /^\/wp-/i,                 // /wp-login.php, /wp-admin/*, /wp-content/*, /wp-json/*
  /^\/wordpress\//i,
  /^\/xmlrpc\.php/i,
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/phpmyadmin/i,
  /^\/administrator\//i,     // Joomla
  /^\/vendor\/phpunit/i,
  /\.(php|asp|aspx|cgi)$/i,  // сайт на Node.js — своих .php/.asp быть не может
];

// Известные боты/сканеры по User-Agent (поисковые боты сюда не входят намеренно —
// их можно учитывать отдельно, если понадобится SEO-аналитика по индексации).
const BOT_UA_PATTERNS = [
  /bot|crawl|spider|scan|curl|wget|python-requests|libwww|httpclient|masscan|nmap|nikto|zgrab|censys|shodan/i,
];

function isLikelyBot(req, ua) {
  if (BOT_PATH_PATTERNS.some((re) => re.test(req.path))) return true;
  if (!ua || BOT_UA_PATTERNS.some((re) => re.test(ua))) return true;
  return false;
}

const crypto = require('crypto');

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const part = header.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function trackVisit(req, res, next) {
  // Пропускать статику и API
  if (
    req.path.startsWith('/admin') ||
    req.path.startsWith('/api') ||
    req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|map)$/)
  ) {
    return next();
  }

  const ua = req.headers['user-agent'] || '';

  // Известные сканеры уязвимостей — сразу отдаём 404, не тратя время на сессии/БД.
  if (BOT_PATH_PATTERNS.some((re) => re.test(req.path))) {
    return res.status(404).end();
  }

  // Остальной подозрительный трафик (боты по User-Agent) — не засоряем статистику,
  // но и не блокируем (мало ли легитимный инструмент мониторинга) — просто не считаем визитом.
  if (isLikelyBot(req, ua)) {
    return next();
  }

  try {
    const db = getDb();
    const device = /mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop';
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const referer = req.headers['referer'] || '';

    // ВАЖНО: express-session у нас настроен с saveUninitialized:false — для обычных
    // посетителей (не логинящихся в админку) cookie сессии никогда не выставляется,
    // и req.session.id на каждый запрос генерируется новый. Из-за этого 1 клиент,
    // зашедший 10 раз за день, считался как 10 разных "уникальных" визитов.
    // Поэтому используем отдельную долгоживущую cookie-метку посетителя.
    let vid = getCookie(req, 'rt_vid');
    if (!vid) {
      vid = crypto.randomBytes(16).toString('hex');
      try {
        res.cookie('rt_vid', vid, {
          maxAge: 180 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
      } catch (e) {}
    }

    // Один и тот же посетитель (по vid, а если cookie не дошла — по IP) считается
    // как 1 визит за календарные сутки, сколько бы страниц он ни открыл.
    const dedupeKey = vid || ip;
    const already = dedupeKey && db.prepare(
      "SELECT 1 FROM visits WHERE date(created_at)=date('now') AND session_id=? LIMIT 1"
    ).get(dedupeKey);
    if (already) return next();

    db.prepare(
      'INSERT INTO visits (page, ip, user_agent, device, referer, session_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.path, ip, ua.substring(0, 200), device, referer.substring(0, 500), dedupeKey);
  } catch (e) {}

  next();
}

module.exports = trackVisit;
