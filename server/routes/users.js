const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { dbRun, dbGet, dbAll } = require('../database');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const users = await dbAll(
      `SELECT id, display_name, email, avatar_url, online, last_seen, created_at
       FROM users
       WHERE id != ?
       ORDER BY display_name ASC`,
      [req.user.id]
    );
    res.json({ users });
  } catch (err) {
    console.error('Ошибка получения пользователей:', err);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await dbGet(
      `SELECT id, display_name, email, avatar_url, online, last_seen, created_at
       FROM users WHERE id = ?`,
      [req.params.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json({ user });
  } catch (err) {
    console.error('Ошибка получения пользователя:', err);
    res.status(500).json({ error: 'Ошибка получения пользователя' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.user.id) {
      return res.status(403).json({ error: 'Можно редактировать только свой профиль' });
    }

    const { display_name, avatar_url } = req.body;
    const updates = [];
    const params = [];
    if (display_name) {
      updates.push('display_name = ?');
      params.push(display_name);
    }
    if (avatar_url) {
      updates.push('avatar_url = ?');
      params.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    params.push(id);
    await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const user = await dbGet('SELECT id, display_name, email, avatar_url, online, last_seen FROM users WHERE id = ?', [id]);
    res.json({ user });
  } catch (err) {
    console.error('Ошибка обновления пользователя:', err);
    res.status(500).json({ error: 'Ошибка обновления пользователя' });
  }
});

module.exports = router;
