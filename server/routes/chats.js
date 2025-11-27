const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbRun, dbGet, dbAll } = require('../database');

const router = express.Router();

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const chats = await dbAll(
      `SELECT c.id, c.is_group, c.name, c.created_at,
              m.text AS last_text,
              m.created_at AS last_message_at
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id
       LEFT JOIN LATERAL (
         SELECT text, created_at
         FROM messages
         WHERE chat_id = c.id AND deleted = FALSE
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON TRUE
       WHERE cm.user_id = ?
       ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC`,
      [req.user.id]
    );
    res.json({ chats });
  } catch (err) {
    console.error('Ошибка получения чатов:', err);
    res.status(500).json({ error: 'Ошибка получения чатов' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { participantId } = req.body;
    if (!participantId) {
      return res.status(400).json({ error: 'Нужно указать собеседника' });
    }

    const existing = await dbGet(
      `SELECT c.id
       FROM chats c
       JOIN chat_members a ON a.chat_id = c.id AND a.user_id = ?
       JOIN chat_members b ON b.chat_id = c.id AND b.user_id = ?
       WHERE c.is_group = FALSE`,
      [req.user.id, participantId]
    );

    if (existing) {
      const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [existing.id]);
      return res.json({ chat, message: 'Чат уже существует' });
    }

    const chatInsert = await dbRun('INSERT INTO chats (is_group, name) VALUES (FALSE, NULL)', []);
    await dbRun('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)', [chatInsert.id, req.user.id, 'member']);
    await dbRun('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)', [chatInsert.id, participantId, 'member']);

    const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [chatInsert.id]);
    res.status(201).json({ chat });
  } catch (err) {
    console.error('Ошибка создания чата:', err);
    res.status(500).json({ error: 'Ошибка создания чата' });
  }
});

router.post('/group', async (req, res) => {
  try {
    const { name, participantIds = [] } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Введите название группы' });
    }
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'Укажите участников' });
    }

    const chatInsert = await dbRun('INSERT INTO chats (is_group, name) VALUES (TRUE, ?)', [name]);
    await dbRun('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)', [chatInsert.id, req.user.id, 'owner']);
    for (const memberId of participantIds) {
      await dbRun('INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)', [chatInsert.id, memberId, 'member']);
    }

    const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [chatInsert.id]);
    res.status(201).json({ chat });
  } catch (err) {
    console.error('Ошибка создания группы:', err);
    res.status(500).json({ error: 'Ошибка создания группы' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [req.params.id]);
    if (!chat) {
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const membership = await dbGet('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', [chat.id, req.user.id]);
    if (!membership) {
      return res.status(403).json({ error: 'Вы не участник этого чата' });
    }

    const members = await dbAll(
      `SELECT u.id, u.display_name, u.avatar_url, cm.role, u.online, u.last_seen
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = ?
       ORDER BY cm.joined_at ASC`,
      [chat.id]
    );

    res.json({ chat: { ...chat, members } });
  } catch (err) {
    console.error('Ошибка получения чата:', err);
    res.status(500).json({ error: 'Ошибка получения чата' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const membership = await dbGet('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!membership) {
      return res.status(403).json({ error: 'Вы не участник этого чата' });
    }

    await dbRun('DELETE FROM chats WHERE id = ?', [req.params.id]);
    res.json({ message: 'Чат удалён' });
  } catch (err) {
    console.error('Ошибка удаления чата:', err);
    res.status(500).json({ error: 'Ошибка удаления чата' });
  }
});

module.exports = router;
