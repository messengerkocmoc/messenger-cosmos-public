# kocmoc Messenger — Deployment for VPS (Ubuntu 22.04)

Этот пакет подготовлен для развёртывания на VPS с Ubuntu 22.04 и белым IP 95.181.213.140.
Проект использует Node.js + SQLite (локальный файл). Nginx — reverse proxy на 80 порт.

## Файлы добавленные/изменённые
- `.env` — шаблон переменных окружения (заполните `JWT_SECRET` и другие значения перед запуском)
- `package.json` — улучшенные скрипты (`pm2:start`, `postinstall`)
- `ecosystem.config.js` — конфиг для `pm2`
- `nginx.conf` — конфиг для `/etc/nginx/sites-available/kocmoc-messenger`
- `README_DEPLOY.md` — инструкция по развёртыванию

## Шаги развёртывания (Ubuntu 22.04)
1. Подключитесь к серверу (VM) по SSH и перейдите в рабочую папку, например `/opt/`:
```bash
ssh user@95.181.213.140
sudo mkdir -p /opt/kocmoc-messenger
sudo chown $USER:$USER /opt/kocmoc-messenger
```

2. Скопируйте и распакуйте проект в `/opt/kocmoc-messenger` (или клонируйте репозиторий):
```bash
scp kocmoc-messenger-deploy.zip user@95.181.213.140:/home/user/
unzip kocmoc-messenger-deploy.zip -d /opt/kocmoc-messenger
cd /opt/kocmoc-messenger
```

3. Установите Node.js (рекомендуется Node 18+), npm, nginx и pm2:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update
sudo apt install -y nodejs nginx unzip
sudo npm install -g pm2
```

4. Установите зависимости проекта:
```bash
cd /opt/kocmoc-messenger
npm ci --production
```

5. Настройте `.env` (обязательно замените JWT_SECRET и проверьте путь к SQLITE_FILE):
```bash
nano .env
```

6. Запустите приложение через pm2:
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd
```

7. Настройка Nginx:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/kocmoc-messenger
sudo ln -s /etc/nginx/sites-available/kocmoc-messenger /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

8. HTTPS позже: привязать домен и использовать certbot/Let's Encrypt.

9. Логи и отладка:
- pm2 logs kocmoc-messenger
- tail -f /var/log/nginx/kocmoc-messenger.error.log
- tail -f /var/log/nginx/kocmoc-messenger.access.log
