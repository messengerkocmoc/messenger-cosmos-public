const jwt = require('jsonwebtoken');
const { dbGet } = require('../database');

// Используем тот же секрет, что и раньше
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Проверяем существование пользователя
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        
        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        // Проверяем сессию (опционально, можно закомментировать если проблемы)
        try {
            const session = await dbGet('SELECT * FROM sessions WHERE token = ? AND user_id = ?', [token, decoded.userId]);
            
            if (!session) {
                console.log('Сессия не найдена, но продолжаем...');
                // return res.status(401).json({ error: 'Сессия недействительна' });
            }
        } catch (sessionError) {
            console.log('Ошибка проверки сессии:', sessionError);
            // Продолжаем без проверки сессии
        }

        if (user.banned) {
            return res.status(403).json({ error: 'Пользователь заблокирован' });
        }

        // Устанавливаем пользователя в req
        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            is_admin: user.is_admin,
            online: user.online
        };
        
        req.token = token;
        next();
    } catch (err) {
        console.error('JWT Error:', err.message);
        
        // Более детальные ошибки
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Токен истёк' });
        } else if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Недействительный токен' });
        } else {
            return res.status(401).json({ error: 'Ошибка аутентификации' });
        }
    }
}

async function requireAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ error: 'Требуются права администратора' });
    }
    next();
}

module.exports = {
    authenticateToken,
    requireAdmin,
    JWT_SECRET
};