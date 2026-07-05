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
    const sessionId = req.session ? req.session.id : '';

    db.prepare(
      'INSERT INTO visits (page, ip, user_agent, device, referer, session_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.path, ip, ua.substring(0, 200), device, referer.substring(0, 500), sessionId);
  } catch (e) {}

  next();
}

module.exports = trackVisit;
