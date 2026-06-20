const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.send(loginPage(req.query.error));
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  try {
    const match = await bcrypt.compare(password || '', hash || '');
    if (match) {
      req.session.isAdmin = true;
      req.session.save(() => res.redirect('/admin'));
    } else {
      res.redirect('/admin/login?error=1');
    }
  } catch (e) {
    res.redirect('/admin/login?error=1');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Вход в панель управления</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:linear-gradient(135deg,#1a2e25 0%,#2d4a38 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;border-radius:24px;padding:40px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
    .logo{text-align:center;margin-bottom:32px}
    .logo h1{font-size:24px;color:#1a2e25;font-weight:800}
    .logo p{color:#6e7c72;font-size:14px;margin-top:4px}
    label{display:block;font-weight:700;font-size:13px;color:#1a2e25;margin-bottom:6px}
    input[type=password]{width:100%;padding:12px 16px;border:2px solid #e2dacb;border-radius:12px;font-size:16px;outline:none;transition:border-color .2s;font-family:inherit}
    input[type=password]:focus{border-color:#21372f}
    .error{background:#fff0f0;border:1px solid #ffcdd2;color:#c62828;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:16px}
    button{width:100%;padding:14px;background:#21372f;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;margin-top:16px;font-family:inherit;transition:background .2s}
    button:hover{background:#2d4a38}
    .hint{text-align:center;font-size:12px;color:#6e7c72;margin-top:20px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>🪑 Мебель на заказ</h1>
      <p>Панель управления</p>
    </div>
    ${error ? '<div class="error">❌ Неверный пароль. Попробуйте ещё раз.</div>' : ''}
    <form method="POST" action="/admin/login">
      <div style="margin-bottom:20px">
        <label for="password">Пароль</label>
        <input type="password" id="password" name="password" placeholder="Введите пароль" autofocus>
      </div>
      <button type="submit">Войти →</button>
    </form>
    <p class="hint">Доступ только для администратора</p>
  </div>
</body>
</html>`;
}

module.exports = router;
