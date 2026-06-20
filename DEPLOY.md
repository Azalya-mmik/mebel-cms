# 🚀 Инструкция по деплою на Timeweb Cloud

## Метод 1: Через панель управления Timeweb Cloud (рекомендуется)

### Шаг 1: Создайте Node.js приложение
1. Войдите в панель Timeweb Cloud: https://timeweb.cloud
2. Перейдите в **"Облачные серверы"** → **"Создать"**
3. Выберите образ: **Ubuntu 22.04 LTS**
4. Тариф: от 200 ₽/месяц (1 vCPU, 1GB RAM)
5. Нажмите **"Создать"** и запомните IP-адрес

### Шаг 2: Подключитесь к серверу по SSH
```bash
ssh root@ВАШ_IP
```

### Шаг 3: Установите Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v  # должно показать v20.x.x
```

### Шаг 4: Установите PM2 (менеджер процессов)
```bash
npm install -g pm2
```

### Шаг 5: Загрузите проект
**Вариант А — через Git:**
```bash
# На сервере
git clone https://github.com/ваш-аккаунт/mebel-cms.git /var/www/mebel
cd /var/www/mebel
npm install
```

**Вариант Б — через SCP (загрузка папки с компьютера):**
```bash
# На вашем компьютере
scp -r ./mebel-cms root@ВАШ_IP:/var/www/mebel
```

### Шаг 6: Настройте .env файл на сервере
```bash
cd /var/www/mebel
nano .env
```
Вставьте и отредактируйте:
```
PORT=3000
SESSION_SECRET=придумайте_сложный_секрет_тут
ADMIN_PASSWORD_HASH=  # оставьте пустым, сгенерируется автоматически
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ваш@gmail.com
SMTP_PASS=пароль_приложения_gmail
NOTIFY_EMAIL=ваш@gmail.com
```

### Шаг 7: Создайте папку для загрузок
```bash
mkdir -p /var/www/mebel/public/uploads
chmod 755 /var/www/mebel/public/uploads
```

### Шаг 8: Запустите через PM2
```bash
cd /var/www/mebel
pm2 start server.js --name mebel-cms
pm2 startup  # автозапуск при перезагрузке
pm2 save
pm2 logs mebel-cms  # просмотр логов
```

### Шаг 9: Настройте Nginx (обратный прокси)
```bash
sudo apt install nginx -y
```

Создайте конфиг:
```bash
nano /etc/nginx/sites-available/mebel
```

Вставьте:
```nginx
server {
    listen 80;
    server_name ВАШ_ДОМЕН.ru www.ВАШ_ДОМЕН.ru;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        alias /var/www/mebel/public/uploads;
        expires 30d;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/mebel /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Шаг 10: SSL-сертификат (HTTPS)
```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d ВАШ_ДОМЕН.ru -d www.ВАШ_ДОМЕН.ru
```

---

## Метод 2: Через Timeweb Cloud Apps (если доступно)

1. Панель → **App Platform** → **Создать приложение**
2. Выберите **Node.js**
3. Подключите GitHub репозиторий
4. Build command: `npm install`
5. Start command: `node server.js`
6. Добавьте переменные окружения из `.env`
7. Deploy!

---

## Переменные окружения (Environment Variables)

| Переменная | Описание | Пример |
|---|---|---|
| `PORT` | Порт сервера | `3000` |
| `SESSION_SECRET` | Секрет для сессий | `my_super_secret_123` |
| `ADMIN_PASSWORD_HASH` | bcrypt хэш пароля | генерируется автоматически |
| `SMTP_HOST` | SMTP сервер | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP порт | `587` |
| `SMTP_USER` | Email отправителя | `shop@gmail.com` |
| `SMTP_PASS` | Пароль приложения | `xxxx xxxx xxxx xxxx` |
| `NOTIFY_EMAIL` | Куда слать уведомления | `admin@example.com` |

---

## Полезные команды PM2

```bash
pm2 status           # статус приложений
pm2 restart mebel-cms  # перезапуск
pm2 stop mebel-cms   # остановить
pm2 logs mebel-cms   # логи в реальном времени
pm2 monit            # мониторинг ресурсов
```

---

## Обновление приложения

```bash
cd /var/www/mebel
git pull origin main  # если через Git
npm install           # обновить зависимости
pm2 restart mebel-cms
```

---

## Настройка Gmail для отправки писем

1. Включите двухфакторную аутентификацию Gmail
2. Перейдите: Google Account → Security → **App passwords**
3. Создайте пароль приложения для "Mail"
4. Используйте этот пароль в `SMTP_PASS`

---

## После установки

- Сайт: `http://ВАШ_IP` или `https://ВАШ_ДОМЕН.ru`
- Админка: `https://ВАШ_ДОМЕН.ru/admin`
- Пароль: `aidar9`

> ⚠️ **ВАЖНО**: После первого входа обязательно смените пароль в `.env` файле!
