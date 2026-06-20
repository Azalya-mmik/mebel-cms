const { getDb } = require('../db/init');

function trackVisit(req, res, next) {
  // Пропускать статику и API
  if (
    req.path.startsWith('/admin') ||
    req.path.startsWith('/api') ||
    req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|map)$/)
  ) {
    return next();
  }

  try {
    const db = getDb();
    const ua = req.headers['user-agent'] || '';
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
