const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbRun, dbGet, dbAll } = require('../database');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const stories = await dbAll(
      `SELECT s.id, s.type, s.media_url, s.created_at, s.expires_at,
              u.id AS user_id, u.display_name, u.avatar_url
       FROM stories s
       JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > NOW()
       ORDER BY s.created_at DESC`
    );
    res.json({ stories });
  } catch (err) {
    console.error('Ошибка получения сторис:', err);
    res.status(500).json({ error: 'Ошибка получения сторис' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { type, media_url, expires_at } = req.body;
    if (!type || !media_url || !expires_at) {
      return res.status(400).json({ error: 'Заполните тип, media_url и expires_at' });
    }

    const insert = await dbRun(
      `INSERT INTO stories (user_id, type, media_url, expires_at)
       VALUES (?, ?, ?, ?)`
      , [req.user.id, type, media_url, expires_at]
    );

    const story = await dbGet('SELECT * FROM stories WHERE id = ?', [insert.id]);
    res.status(201).json({ story });
  } catch (err) {
    console.error('Ошибка создания сторис:', err);
    res.status(500).json({ error: 'Ошибка создания сторис' });
  }
});

router.post('/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    const story = await dbGet('SELECT * FROM stories WHERE id = ?', [id]);
    if (!story) {
      return res.status(404).json({ error: 'Сторис не найдена' });
    }

    await dbRun(
      `INSERT INTO story_views (story_id, viewer_id)
       VALUES (?, ?)
       ON CONFLICT (story_id, viewer_id) DO UPDATE SET viewed_at = NOW()`,
      [id, req.user.id]
    );

    res.json({ message: 'Просмотр зафиксирован' });
  } catch (err) {
    console.error('Ошибка фиксации просмотра сторис:', err);
    res.status(500).json({ error: 'Ошибка фиксации просмотра сторис' });
  }
});

module.exports = router;
