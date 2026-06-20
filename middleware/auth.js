function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.redirect('/admin/login');
}

function logAction(db, action, details, req) {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    db.prepare('INSERT INTO admin_log (action, details, ip) VALUES (?, ?, ?)')
      .run(action, details || '', ip);
  } catch (e) {}
}

module.exports = { requireAuth, logAction };
