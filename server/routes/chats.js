const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// Получить все чаты пользователя
router.get('/', async (req, res) => {
    try {
        const chats = await dbAll(`
            SELECT 
                c.id, c.name, c.avatar, c.type, c.created_at,
                cp.unread_count, cp.muted, cp.archived,
                (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
            FROM chats c
            JOIN chat_participants cp ON c.id = cp.chat_id
            WHERE cp.user_id = ?
            ORDER BY last_message_time DESC
        `, [req.user.id]);

        res.json({ chats });
    } catch (err) {
        console.error('Ошибка получения чатов:', err);
        res.status(500).json({ error: 'Ошибка получения чатов' });
    }
});

// Создать чат
router.post('/', async (req, res) => {
    try {
        const { participantIds, name, type = 'personal' } = req.body;

        if (!participantIds || participantIds.length === 0) {
            return res.status(400).json({ error: 'Укажите участников чата' });
        }

        // Для личного чата проверяем существование
        if (type === 'personal' && participantIds.length === 1) {
            const otherUserId = participantIds[0];
            const existingChat = await dbGet(`
                SELECT c.id FROM chats c
                JOIN chat_participants cp1 ON c.id = cp1.chat_id
                JOIN chat_participants cp2 ON c.id = cp2.chat_id
                WHERE c.type = 'personal'
                AND cp1.user_id = ?
                AND cp2.user_id = ?
            `, [req.user.id, otherUserId]);

            if (existingChat) {
                const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [existingChat.id]);
                return res.json({ chat, message: 'Чат уже существует' });
            }

            const otherUser = await dbGet('SELECT name, avatar FROM users WHERE id = ?', [otherUserId]);
            
            const result = await dbRun(`
                INSERT INTO chats (name, avatar, type)
                VALUES (?, ?, 'personal')
            `, [otherUser.name, otherUser.avatar]);

            const chatId = result.id;

            await dbRun('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, req.user.id]);
            await dbRun('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, otherUserId]);

            const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [chatId]);
            return res.status(201).json({ chat, message: 'Чат создан' });
        }

        // Групповой чат
        const result = await dbRun(`
            INSERT INTO chats (name, avatar, type)
            VALUES (?, ?, ?)
        `, [name || 'Групповой чат', null, type]);

        const chatId = result.id;

        await dbRun('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, req.user.id]);

        for (const userId of participantIds) {
            await dbRun('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)', [chatId, userId]);
        }

        const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [chatId]);
        res.status(201).json({ chat, message: 'Групповой чат создан' });
    } catch (err) {
        console.error('Ошибка создания чата:', err);
        res.status(500).json({ error: 'Ошибка создания чата' });
    }
});

// Получить чат
router.get('/:id', async (req, res) => {
    try {
        const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [req.params.id]);
        
        if (!chat) {
            return res.status(404).json({ error: 'Чат не найден' });
        }

        const participant = await dbGet('SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?', [chat.id, req.user.id]);
        if (!participant) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }

        const participants = await dbAll(`
            SELECT u.id, u.name, u.email, u.avatar, u.online
            FROM users u
            JOIN chat_participants cp ON u.id = cp.user_id
            WHERE cp.chat_id = ?
        `, [chat.id]);

        res.json({ chat: { ...chat, participants } });
    } catch (err) {
        console.error('Ошибка получения чата:', err);
        res.status(500).json({ error: 'Ошибка получения чата' });
    }
});

// Обновить настройки чата
router.put('/:id', async (req, res) => {
    try {
        const { muted, archived, unreadCount } = req.body;
        const chatId = req.params.id;

        const participant = await dbGet('SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?', [chatId, req.user.id]);
        
        if (!participant) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }

        const updates = [];
        const params = [];

        if (typeof muted !== 'undefined') {
            updates.push('muted = ?');
            params.push(muted ? 1 : 0);
        }
        if (typeof archived !== 'undefined') {
            updates.push('archived = ?');
            params.push(archived ? 1 : 0);
        }
        if (typeof unreadCount !== 'undefined') {
            updates.push('unread_count = ?');
            params.push(unreadCount);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Нет данных для обновления' });
        }

        params.push(chatId, req.user.id);
        await dbRun(`UPDATE chat_participants SET ${updates.join(', ')} WHERE chat_id = ? AND user_id = ?`, params);

        res.json({ message: 'Настройки чата обновлены' });
    } catch (err) {
        console.error('Ошибка обновления чата:', err);
        res.status(500).json({ error: 'Ошибка обновления чата' });
    }
});

// Удалить чат
router.delete('/:id', async (req, res) => {
    try {
        const chatId = req.params.id;

        const participant = await dbGet('SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?', [chatId, req.user.id]);
        if (!participant) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }

        await dbRun('DELETE FROM chats WHERE id = ?', [chatId]);

        res.json({ message: 'Чат удалён' });
    } catch (err) {
        console.error('Ошибка удаления чата:', err);
        res.status(500).json({ error: 'Ошибка удаления чата' });
    }
});

module.exports = router;