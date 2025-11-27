const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// Encryption utilities. If MESSAGE_KEY is not configured, these
// functions will throw at module load time. See
// server/utils/encryption.js for details.
const { encryptMessage, decryptMessage } = require('../utils/encryption');

const router = express.Router();

router.use(authenticateToken);

// Получить сообщения чата
router.get('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        // Проверяем, что пользователь аутентифицирован
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        // Проверяем участие в чате
        const participant = await dbGet(
            'SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?', 
            [chatId, req.user.id]
        );
        
        if (!participant) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }

        // Безопасный запрос с проверкой существования колонок
        let messages;
        try {
            messages = await dbAll(`
                SELECT 
                    m.id, m.text, m.status, m.created_at,
                    m.sender_id,
                    m.message_type,
                    m.file_url, m.file_name, m.file_size, m.file_type,
                    m.voice_url, m.voice_duration,
                    u.name as sender_name,
                    u.avatar as sender_avatar
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.chat_id = ?
                ORDER BY m.created_at ASC
                LIMIT ? OFFSET ?
            `, [chatId, parseInt(limit), parseInt(offset)]);
        } catch (dbError) {
            // Если есть ошибка с колонками, используем упрощенный запрос
            console.log('Используем упрощенный запрос для сообщений:', dbError.message);
            messages = await dbAll(`
                SELECT 
                    m.id, m.text, m.status, m.created_at,
                    m.sender_id,
                    u.name as sender_name,
                    u.avatar as sender_avatar
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.chat_id = ?
                ORDER BY m.created_at ASC
                LIMIT ? OFFSET ?
            `, [chatId, parseInt(limit), parseInt(offset)]);
        }

        // Decrypt message text before sending to client. If decryption fails,
        // the original ciphertext is returned unchanged.
        const decrypted = messages.map(m => {
            if (m && typeof m.text === 'string' && m.text !== null) {
                try {
                    m.text = decryptMessage(m.text);
                } catch (err) {
                    // Leave as‑is on decryption error
                }
            }
            return m;
        });
        res.json({ messages: decrypted });
    } catch (err) {
        console.error('Ошибка получения сообщений:', err);
        res.status(500).json({ error: 'Ошибка получения сообщений' });
    }
});

// Отправить сообщение
router.post('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { text, file_url, file_name, file_size, file_type, voice_url, voice_duration, message_type = 'text' } = req.body;

        // Проверяем, что пользователь аутентифицирован
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        if (!text && !file_url && !voice_url) {
            return res.status(400).json({ error: 'Сообщение не может быть пустым' });
        }

        // Проверяем участие в чате
        const participant = await dbGet(
            'SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?', 
            [chatId, req.user.id]
        );
        
        if (!participant) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }

        let result;
        try {
            // Зашифровываем текст перед сохранением. Остальные поля храним без изменений.
            const encryptedText = text ? encryptMessage(text) : null;
            // Пытаемся использовать полный запрос с новыми полями
            result = await dbRun(`
                INSERT INTO messages (chat_id, sender_id, text, message_type, file_url, file_name, file_size, file_type, voice_url, voice_duration, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')
            `, [chatId, req.user.id, encryptedText, message_type, file_url, file_name, file_size, file_type, voice_url, voice_duration]);
        } catch (insertError) {
            // Если ошибка, используем простой запрос. Шифруем текст так же.
            console.log('Используем упрощенную вставку сообщения:', insertError.message);
            const encryptedText2 = text ? encryptMessage(text) : null;
            result = await dbRun(`
                INSERT INTO messages (chat_id, sender_id, text, status)
                VALUES (?, ?, ?, 'sent')
            `, [chatId, req.user.id, encryptedText2]);
        }

        // Увеличиваем счётчик непрочитанных для других участников
        await dbRun(`
            UPDATE chat_participants 
            SET unread_count = unread_count + 1 
            WHERE chat_id = ? AND user_id != ?
        `, [chatId, req.user.id]);

        // Получаем созданное сообщение
        let message;
        try {
            message = await dbGet(`
                SELECT 
                    m.id, m.text, m.status, m.created_at, m.message_type,
                    m.file_url, m.file_name, m.file_size, m.file_type,
                    m.voice_url, m.voice_duration,
                    m.sender_id,
                    u.name as sender_name,
                    u.avatar as sender_avatar
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = ?
            `, [result.id]);
        } catch (selectError) {
            // Упрощенный запрос для получения сообщения
            message = await dbGet(`
                SELECT 
                    m.id, m.text, m.status, m.created_at,
                    m.sender_id,
                    u.name as sender_name,
                    u.avatar as sender_avatar
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.id = ?
            `, [result.id]);
        }

        // Расшифровываем текст перед отправкой ответа
        if (message && typeof message.text === 'string' && message.text !== null) {
            try {
                message.text = decryptMessage(message.text);
            } catch (err) {
                // leave as‑is on failure
            }
        }
        res.status(201).json({ message });
    } catch (err) {
        console.error('Ошибка отправки сообщения:', err);
        res.status(500).json({ error: 'Ошибка отправки сообщения' });
    }
});

// Добавить реакцию к сообщению
router.post('/:messageId/react', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { reaction } = req.body;

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        if (!reaction) {
            return res.status(400).json({ error: 'Реакция обязательна' });
        }

        // Проверяем существование таблицы реакций
        try {
            // Удаляем существующую реакцию
            await dbRun('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, req.user.id]);

            // Добавляем новую реакцию
            await dbRun('INSERT INTO message_reactions (message_id, user_id, reaction) VALUES (?, ?, ?)', 
                [messageId, req.user.id, reaction]);

            res.json({ success: true, message: 'Реакция добавлена' });
        } catch (reactionError) {
            console.log('Таблица реакций не доступна:', reactionError.message);
            res.status(501).json({ error: 'Функция реакций временно недоступна' });
        }
    } catch (err) {
        console.error('Ошибка добавления реакции:', err);
        res.status(500).json({ error: 'Ошибка добавления реакции' });
    }
});

// Удалить реакцию
router.delete('/:messageId/react', async (req, res) => {
    try {
        const { messageId } = req.params;

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        try {
            await dbRun('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, req.user.id]);
            res.json({ success: true, message: 'Реакция удалена' });
        } catch (reactionError) {
            console.log('Таблица реакций не доступна:', reactionError.message);
            res.status(501).json({ error: 'Функция реакций временно недоступна' });
        }
    } catch (err) {
        console.error('Ошибка удаления реакции:', err);
        res.status(500).json({ error: 'Ошибка удаления реакции' });
    }
});

// Пометить сообщения как прочитанные
router.put('/:chatId/read', async (req, res) => {
    try {
        const { chatId } = req.params;

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        await dbRun(`
            UPDATE chat_participants 
            SET unread_count = 0 
            WHERE chat_id = ? AND user_id = ?
        `, [chatId, req.user.id]);

        res.json({ message: 'Сообщения помечены как прочитанные' });
    } catch (err) {
        console.error('Ошибка пометки сообщений:', err);
        res.status(500).json({ error: 'Ошибка пометки сообщений' });
    }
});

// Удалить сообщение
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        const message = await dbGet('SELECT * FROM messages WHERE id = ?', [id]);
        if (!message) {
            return res.status(404).json({ error: 'Сообщение не найдено' });
        }

        if (message.sender_id !== req.user.id && !req.user.is_admin) {
            return res.status(403).json({ error: 'Вы не можете удалить это сообщение' });
        }

        await dbRun('DELETE FROM messages WHERE id = ?', [id]);

        res.json({ message: 'Сообщение удалено' });
    } catch (err) {
        console.error('Ошибка удаления сообщения:', err);
        res.status(500).json({ error: 'Ошибка удаления сообщения' });
    }
});

// Поиск сообщений в чате
router.get('/:chatId/search', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { q: query } = req.query;

        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Запрос должен содержать минимум 2 символа' });
        }

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        // Проверяем участие в чате
        const participant = await dbGet(
            'SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?', 
            [chatId, req.user.id]
        );
        
        if (!participant) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }

        // Зашифрованные сообщения нельзя искать в базе по LIKE. Получаем
        // сообщения и фильтруем по расшифрованному тексту на сервере.
        const rows = await dbAll(`
            SELECT 
                m.id, m.text, m.created_at,
                m.sender_id,
                u.name as sender_name,
                u.avatar as sender_avatar
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ?
            ORDER BY m.created_at DESC
            LIMIT 200
        `, [chatId]);
        const q = String(query).toLowerCase();
        const filtered = [];
        for (const m of rows) {
            let plain;
            try {
                plain = decryptMessage(m.text);
            } catch (err) {
                plain = m.text;
            }
            if (plain && plain.toLowerCase().includes(q)) {
                m.text = plain;
                filtered.push(m);
                if (filtered.length >= 50) break;
            }
        }
        res.json({ messages: filtered });
    } catch (err) {
        console.error('Ошибка поиска сообщений:', err);
        res.status(500).json({ error: 'Ошибка поиска сообщений' });
    }
});

module.exports = router;