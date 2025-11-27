// =======================
// kocmoc server (VPS ready)
// =======================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Инициализация базы данных
const { initDatabase } = require('./database');

// Роуты API
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const fileRoutes = require('./routes/files');
const storyRoutes = require('./routes/stories');
const maintenanceRouter = require('./routes/maintenance');

// ----------------------
// Инициализация Express
// ----------------------
const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------
// Middleware профилактики
// ----------------------
app.use((req, res, next) => {
  // Разрешаем доступ к панели администратора и статике
  if (req.url.startsWith('/admin') || req.url.startsWith('/css') || req.url.startsWith('/js') || req.url.startsWith('/uploads')) {
    return next();
  }

  const flagPath = path.join(process.cwd(), 'maintenance.flag');
  if (fs.existsSync(flagPath)) {
    return res.status(503).send(`
      <!doctype html>
      <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Профилактика</title>
          <style>
            body { 
              margin:0; 
              padding:0; 
              display:flex; 
              align-items:center; 
              justify-content:center; 
              height:100vh; 
              font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
              background: radial-gradient(circle at top, #4b5563, #020617);
              color:#f9fafb;
              text-align:center;
            }
            .card {
              background: rgba(15,23,42,0.9);
              border-radius: 18px;
              padding: 32px 28px;
              box-shadow: 0 20px 45px rgba(0,0,0,0.45);
              max-width: 420px;
            }
            h1 { font-size: 1.8rem; margin: 0 0 0.5rem; }
            p { margin: 0.35rem 0; color: #9ca3af; }
            .emoji { font-size: 2.4rem; margin-bottom: 0.5rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="emoji">🛠</div>
            <h1>Профилактические работы</h1>
            <p>Сервис временно недоступен.</p>
            <p>Попробуйте зайти чуть позже.</p>
          </div>
        </body>
      </html>
    `);
  }
  next();
});

// ----------------------
// Базовые middleware
// ----------------------
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Инициализация базы
initDatabase();

// ----------------------
// Статика
// ----------------------
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ----------------------
// API роуты
// ----------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api', messageRoutes);
app.use('/api/upload', fileRoutes);
app.use('/api/stories', storyRoutes);

// Админ-маршруты (профилактика)
app.use('/admin', maintenanceRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ----------------------
// Запуск сервера
// ----------------------
const server = app.listen(PORT, () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  Object.keys(interfaces).forEach(ifname => {
    interfaces[ifname].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(`${iface.address}:${PORT}`);
      }
    });
  });

  console.log('🚀 Мессенджер kocmoc запущен!');
  console.log(`📍 Локально:  http://localhost:${PORT}`);
  addresses.forEach(addr => console.log(`🌐 Сеть:      http://${addr}`));
  console.log('🧰 Админ-панель: /admin (см. ADMIN_TOKEN в .env)');
});

// ----------------------
// Корректное завершение
// ----------------------
process.on('SIGINT', () => {
  console.log('\n🛑 Остановка сервера...');
  server.close(() => {
    console.log('✅ Сервер успешно остановлен');
    process.exit(0);
  });
});

module.exports = app;
