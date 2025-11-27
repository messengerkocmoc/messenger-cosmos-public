const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbRun, dbGet, dbAll } = require('../database');

const router = express.Router({ mergeParams: true });

router.use(authenticateToken);

async function ensureMember(chatId, userId) {
  return dbGet('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', [chatId, userId]);
}

router.get('/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const membership = await ensureMember(chatId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Вы не участник этого чата' });
    }

    const { limit = 50, offset = 0 } = req.query;
    const messages = await dbAll(
      `SELECT m.id, m.type, m.text, m.file_url, m.audio_url, m.sticker_url,
              m.edited, m.deleted, m.created_at,
              u.display_name AS sender_name, u.avatar_url AS sender_avatar
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ?
       ORDER BY m.created_at ASC
       LIMIT ? OFFSET ?`,
      [chatId, parseInt(limit, 10), parseInt(offset, 10)]
    );

    res.json({ messages });
  } catch (err) {
    console.error('Ошибка получения сообщений:', err);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

router.post('/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { type = 'text', text, file_url, audio_url, sticker_url } = req.body;

    const membership = await ensureMember(chatId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Вы не участник этого чата' });
    }

    if (!text && !file_url && !audio_url && !sticker_url) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    const insert = await dbRun(
      `INSERT INTO messages (chat_id, sender_id, type, text, file_url, audio_url, sticker_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [chatId, req.user.id, type, text || null, file_url || null, audio_url || null, sticker_url || null]
    );

    const message = await dbGet(
      `SELECT m.id, m.type, m.text, m.file_url, m.audio_url, m.sticker_url,
              m.edited, m.deleted, m.created_at,
              u.display_name AS sender_name, u.avatar_url AS sender_avatar
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = ?`,
      [insert.id]
    );

    res.status(201).json({ message });
  } catch (err) {
    console.error('Ошибка отправки сообщения:', err);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

router.patch('/messages/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Текст обязателен' });
    }

    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [id]);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Можно редактировать только свои сообщения' });
    }

    await dbRun('UPDATE messages SET text = ?, edited = TRUE WHERE id = ?', [text, id]);
    const updated = await dbGet('SELECT * FROM messages WHERE id = ?', [id]);
    res.json({ message: updated });
  } catch (err) {
    console.error('Ошибка редактирования сообщения:', err);
    res.status(500).json({ error: 'Ошибка редактирования сообщения' });
  }
});

router.delete('/messages/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [id]);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Можно удалить только свои сообщения' });
    }

    await dbRun('UPDATE messages SET deleted = TRUE WHERE id = ?', [id]);
    res.json({ message: 'Сообщение удалено' });
  } catch (err) {
    console.error('Ошибка удаления сообщения:', err);
    res.status(500).json({ error: 'Ошибка удаления сообщения' });
  }
});

router.post('/messages/:id/forward', async (req, res) => {
  try {
    const { id } = req.params;
    const { targetChatId } = req.body;
    if (!targetChatId) {
      return res.status(400).json({ error: 'Нужно указать целевой чат' });
    }

    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [id]);
    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    const membership = await ensureMember(targetChatId, req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Вы не участник целевого чата' });
    }

    const insert = await dbRun(
      `INSERT INTO messages (chat_id, sender_id, type, text, file_url, audio_url, sticker_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [targetChatId, req.user.id, message.type, message.text, message.file_url, message.audio_url, message.sticker_url]
    );

    const forwarded = await dbGet('SELECT * FROM messages WHERE id = ?', [insert.id]);
    res.status(201).json({ message: forwarded });
  } catch (err) {
    console.error('Ошибка пересылки сообщения:', err);
    res.status(500).json({ error: 'Ошибка пересылки сообщения' });
  }
});

module.exports = router;
