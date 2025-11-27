const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Проверка авторизации для всех роутов
router.use(authenticateToken);

// Получить всех пользователей
router.get('/', async (req, res) => {
    try {
        const users = await dbAll(`
            SELECT id, name, email, avatar, bio, birthdate, online, is_admin, banned, created_at
            FROM users
            WHERE id != ?
            ORDER BY name ASC
        `, [req.user.id]);

        res.json({ users });
    } catch (err) {
        console.error('Ошибка получения пользователей:', err);
        res.status(500).json({ error: 'Ошибка получения пользователей' });
    }
});

// Получить пользователя по ID
router.get('/:id', async (req, res) => {
    try {
        const user = await dbGet(`
            SELECT id, name, email, avatar, bio, birthdate, online, is_admin, banned, created_at
            FROM users WHERE id = ?`, [req.params.id]);

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ user });
    } catch (err) {
        console.error('Ошибка получения пользователя:', err);
        res.status(500).json({ error: 'Ошибка получения пользователя' });
    }
});

// Обновить профиль пользователя
router.put('/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { name, avatar, bio, birthdate } = req.body;

        // Проверка прав на обновление профиля
        if (userId !== req.user.id && !req.user.is_admin) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        const updates = [];
        const params = [];

        if (name) {
            updates.push('name = ?');
            params.push(name);
        }
        if (avatar) {
            updates.push('avatar = ?');
            params.push(avatar);
        }
        if (typeof bio !== 'undefined') {
            updates.push('bio = ?');
            params.push(bio);
        }
        if (birthdate) {
            updates.push('birthdate = ?');
            params.push(birthdate);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(userId);
        await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        const user = await dbGet(`
            SELECT id, name, email, avatar, bio, birthdate, online, is_admin, created_at
            FROM users WHERE id = ?`, [userId]);

        res.json({ user, message: 'Профиль обновлён' });
    } catch (err) {
        console.error('Ошибка обновления профиля:', err);
        res.status(500).json({ error: 'Ошибка обновления профиля' });
    }
});

// Админ: статистика системы
router.get('/admin/stats', requireAdmin, async (req, res) => {
    try {
        const usersCount = await dbGet('SELECT COUNT(*) as count FROM users');
        const chatsCount = await dbGet('SELECT COUNT(*) as count FROM chats');
        const messagesCount = await dbGet('SELECT COUNT(*) as count FROM messages');
        const devicesCount = await dbGet('SELECT COUNT(*) as count FROM devices');

        // Безопасное извлечение значений
        const stats = {
            users: usersCount && usersCount.count ? usersCount.count : 0,
            chats: chatsCount && chatsCount.count ? chatsCount.count : 0,
            messages: messagesCount && messagesCount.count ? messagesCount.count : 0,
            devices: devicesCount && devicesCount.count ? devicesCount.count : 0
        };

        res.json({ stats });
    } catch (err) {
        console.error('Ошибка получения статистики:', err);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// Админ: получить все устройства
router.get('/admin/devices', requireAdmin, async (req, res) => {
    try {
        const devices = await dbAll(`
            SELECT device_id, account_count, created_at 
            FROM devices 
            ORDER BY created_at DESC
        `);
        res.json({ devices });
    } catch (err) {
        console.error('Ошибка получения устройств:', err);
        res.status(500).json({ error: 'Ошибка получения устройств' });
    }
});

// Админ: сбросить счетчик устройства
router.put('/admin/devices/:deviceId/reset', requireAdmin, async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        if (!deviceId) {
            return res.status(400).json({ error: 'ID устройства обязателен' });
        }

        const result = await dbRun(
            'UPDATE devices SET account_count = 0 WHERE device_id = ?', 
            [deviceId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Устройство не найдено' });
        }

        res.json({ message: 'Счётчик устройства сброшен' });
    } catch (err) {
        console.error('Ошибка сброса счётчика:', err);
        res.status(500).json({ error: 'Ошибка сброса счётчика' });
    }
});

// Админ: заблокировать пользователя
router.put('/:id/ban', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Нельзя заблокировать себя' });
        }

        // Проверяем существование пользователя
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await dbRun('UPDATE users SET banned = 1 WHERE id = ?', [userId]);
        await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]);

        res.json({ message: 'Пользователь заблокирован' });
    } catch (err) {
        console.error('Ошибка блокировки:', err);
        res.status(500).json({ error: 'Ошибка блокировки' });
    }
});

// Админ: разблокировать пользователя
router.put('/:id/unban', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Проверяем существование пользователя
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await dbRun('UPDATE users SET banned = 0 WHERE id = ?', [userId]);

        res.json({ message: 'Пользователь разблокирован' });
    } catch (err) {
        console.error('Ошибка разблокировки:', err);
        res.status(500).json({ error: 'Ошибка разблокировки' });
    }
});

// Админ: удалить пользователя
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Нельзя удалить себя' });
        }

        // Проверяем существование пользователя
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await dbRun('DELETE FROM users WHERE id = ?', [userId]);

        res.json({ message: 'Пользователь удалён' });
    } catch (err) {
        console.error('Ошибка удаления пользователя:', err);
        res.status(500).json({ error: 'Ошибка удаления пользователя' });
    }
});

// Поиск пользователей
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        
        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Запрос должен содержать минимум 2 символа' });
        }

        const users = await dbAll(`
            SELECT id, name, email, avatar, bio, online
            FROM users 
            WHERE (name LIKE ? OR email LIKE ?) AND id != ?
            ORDER BY name ASC
            LIMIT 20
        `, [`%${query}%`, `%${query}%`, req.user.id]);

        res.json({ users });
    } catch (err) {
        console.error('Ошибка поиска пользователей:', err);
        res.status(500).json({ error: 'Ошибка поиска пользователей' });
    }
});

module.exports = router;