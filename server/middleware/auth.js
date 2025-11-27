const jwt = require('jsonwebtoken');
const { dbGet } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    try {
      const session = await dbGet('SELECT * FROM sessions WHERE token = ? AND user_id = ?', [token, decoded.userId]);
      if (!session) {
        return res.status(401).json({ error: 'Сессия недействительна' });
      }
    } catch (sessionError) {
      console.log('Ошибка проверки сессии:', sessionError.message);
    }

    req.user = {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      avatar_url: user.avatar_url,
      online: user.online,
    };

    req.token = token;
    next();
  } catch (err) {
    console.error('JWT Error:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истёк' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
    return res.status(401).json({ error: 'Ошибка аутентификации' });
  }
}

module.exports = {
  authenticateToken,
  JWT_SECRET,
};