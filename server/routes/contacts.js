
const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Все роуты требуют авторизации
router.use(authenticateToken);

// GET /contacts — список контактов текущего пользователя
router.get('/', async (req, res) => {
    try {
        const contacts = await dbAll(`
            SELECT 
                c.id,
                u.id AS contact_id,
                u.name,
                u.email,
                u.avatar,
                u.bio,
                u.online,
                u.created_at
            FROM contacts c
            JOIN users u ON u.id = c.contact_id
            WHERE c.owner_id = ?
            ORDER BY u.name ASC
        `, [req.user.id]);

        res.json({ contacts });
    } catch (err) {
        console.error('Ошибка получения контактов:', err);
        res.status(500).json({ error: 'Ошибка получения контактов' });
    }
});

// POST /contacts/add — добавить контакт
router.post('/add', async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const targetId = parseInt(userId || contactId, 10);

        if (!targetId || Number.isNaN(targetId)) {
            return res.status(400).json({ error: 'Некорректный ID контакта' });
        }

        if (targetId === req.user.id) {
            return res.status(400).json({ error: 'Нельзя добавить себя в контакты' });
        }

        const user = await dbGet('SELECT id FROM users WHERE id = ?', [targetId]);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        await dbRun(
            'INSERT OR IGNORE INTO contacts (owner_id, contact_id) VALUES (?, ?)',
            [req.user.id, targetId]
        );

        res.json({ success: true, message: 'Контакт добавлен' });
    } catch (err) {
        console.error('Ошибка добавления контакта:', err);
        res.status(500).json({ error: 'Ошибка добавления контакта' });
    }
});

// POST /contacts/remove — удалить контакт
router.post('/remove', async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const targetId = parseInt(userId || contactId, 10);

        if (!targetId || Number.isNaN(targetId)) {
            return res.status(400).json({ error: 'Некорректный ID контакта' });
        }

        await dbRun(
            'DELETE FROM contacts WHERE owner_id = ? AND contact_id = ?',
            [req.user.id, targetId]
        );

        res.json({ success: true, message: 'Контакт удалён' });
    } catch (err) {
        console.error('Ошибка удаления контакта:', err);
        res.status(500).json({ error: 'Ошибка удаления контакта' });
    }
});

module.exports = router;
