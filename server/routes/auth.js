const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbRun, dbGet, dbAll } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');
const nodemailer = require('nodemailer');

const router = express.Router();

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
const VERIFICATION_CODE_EXPIRES_MINUTES = parseInt(process.env.VERIFICATION_CODE_EXPIRES_MINUTES || '15', 10);

let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });
} else {
    console.warn('⚠️ EMAIL_USER или EMAIL_PASS не заданы. Отправка почты отключена.');
}


async function sendVerificationEmail(to, code) {
    if (!transporter) {
        console.warn('Транспорт для отправки почты не настроен, письмо с кодом не отправлено');
        throw new Error('Сервис отправки писем временно недоступен');
    }

    const mailOptions = {
        from: EMAIL_FROM,
        to,
        subject: 'kocmoc — код подтверждения',
        text: [
            'Привет! 👋',
            '',
            'Ты регистрируешься в мессенджере kocmoc.',
            `Твой код подтверждения: ${code}`,
            '',
            `Код действует ${VERIFICATION_CODE_EXPIRES_MINUTES} минут.`,
            '',
            'Если ты не запрашивал(а) этот код — просто проигнорируй это письмо.'
        ].join('\n')
    };

    await transporter.sendMail(mailOptions);
}

// Регистрация
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, avatar, deviceId } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }

        // Проверка лимита аккаунтов на устройство
        let device = await dbGet('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
        if (!device) {
            await dbRun('INSERT INTO devices (device_id, account_count) VALUES (?, 0)', [deviceId]);
            device = { account_count: 0 };
        }

        if (device.account_count >= 3) {
            return res.status(400).json({ error: 'На этом устройстве достигнут лимит аккаунтов (3)' });
        }

        // Проверка существования email
        const existingUser = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создание пользователя
        const result = await dbRun(
            `INSERT INTO users (name, email, password, avatar, online) 
             VALUES (?, ?, ?, ?, 1)`,
            [
                name,
                email,
                hashedPassword,
                avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
            ]
        );

        // Обновляем счетчик устройств
        await dbRun('UPDATE devices SET account_count = account_count + 1 WHERE device_id = ?', [deviceId]);

        // Генерация кода подтверждения
        const code = ('' + Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRES_MINUTES * 60 * 1000).toISOString();

        await dbRun(
            `INSERT INTO email_verifications (user_id, email, code, expires_at) 
             VALUES (?, ?, ?, ?)`,
            [result.id, email, code, expiresAt]
        );

        try {
            await sendVerificationEmail(email, code);
        } catch (mailErr) {
            console.error('Ошибка отправки письма с кодом:', mailErr);
            // Не считаем это критической ошибкой регистрации, но сообщим фронту
            return res.status(500).json({ error: 'Не удалось отправить письмо с кодом подтверждения. Попробуйте позже.' });
        }

        res.status(201).json({
            userId: result.id,
            email,
            message: 'Регистрация успешна. Мы отправили код подтверждения на вашу почту.'
        });
    } catch (err) {
        console.error('Ошибка регистрации:', err);
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

// Подтверждение email по коду
router.post('/verify-email', async (req, res) => {
    try {
        const { userId, code, deviceId } = req.body;

        if (!userId || !code) {
            return res.status(400).json({ error: 'Не переданы пользователь или код' });
        }

        const verification = await dbGet(
            `SELECT * FROM email_verifications 
             WHERE user_id = ? AND code = ? 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userId, code]
        );

        if (!verification) {
            return res.status(400).json({ error: 'Неверный код подтверждения' });
        }

        if (verification.used) {
            return res.status(400).json({ error: 'Этот код уже был использован' });
        }

        const now = new Date();
        const expiresAt = new Date(verification.expires_at);
        if (expiresAt < now) {
            return res.status(400).json({ error: 'Срок действия кода истёк' });
        }

        // Помечаем код как использованный
        await dbRun(
            'UPDATE email_verifications SET used = 1 WHERE id = ?',
            [verification.id]
        );

        // Авторизуем пользователя
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
        await dbRun(
            'INSERT INTO sessions (user_id, token, device_id) VALUES (?, ?, ?)',
            [user.id, token, deviceId || null]
        );

        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio,
            birthdate: user.birthdate,
            online: true,
            is_admin: user.is_admin,
            created_at: user.created_at
        };

        res.json({
            user: userData,
            token,
            message: 'Email успешно подтверждён'
        });
    } catch (err) {
        console.error('Ошибка подтверждения email:', err);
        res.status(500).json({ error: 'Ошибка подтверждения email' });
    }
});


// Повторная отправка кода подтверждения
router.post('/resend-code', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Не передан email' });
        }

        if (!transporter) {
            return res.status(500).json({ error: 'Сервис отправки писем не настроен. Обратитесь к администратору.' });
        }

        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь с таким email не найден' });
        }

        const code = ('' + Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRES_MINUTES * 60 * 1000).toISOString();

        await dbRun(
            `INSERT INTO email_verifications (user_id, email, code, expires_at) 
             VALUES (?, ?, ?, ?)`,
            [user.id, email, code, expiresAt]
        );

        await sendVerificationEmail(email, code);

        res.json({ message: 'Новый код отправлен на вашу почту.' });
    } catch (err) {
        console.error('Ошибка повторной отправки кода:', err);
        res.status(500).json({ error: 'Не удалось отправить код ещё раз. Попробуйте позже.' });
    }
});
// Вход
router.post('/login', async (req, res) => {
    try {
        const { email, password, deviceId } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Заполните email и пароль' });
        }

        // Поиск пользователя
        const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // Проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // Проверяем, подтверждён ли email (для новых аккаунтов)
        const lastVerification = await dbGet(
            `SELECT * FROM email_verifications 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [user.id]
        );

        if (lastVerification && !lastVerification.used) {
            return res.status(403).json({ error: 'Пожалуйста, подтвердите email. Мы уже отправили вам код.' });
        }

        // Создаем JWT токен
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

        // Сохраняем сессию
        await dbRun('INSERT INTO sessions (user_id, token, device_id) VALUES (?, ?, ?)', [user.id, token, deviceId]);

        const userData = {
            id: user.id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio,
            birthdate: user.birthdate,
            online: true,
            is_admin: user.is_admin,
            created_at: user.created_at
        };

        res.json({
            user: userData,
            token,
            message: 'Вход выполнен успешно'
        });
    } catch (err) {
        console.error('Ошибка входа:', err);
        res.status(500).json({ error: 'Ошибка входа' });
    }
});

// Выход
router.post('/logout', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            await dbRun('DELETE FROM sessions WHERE token = ?', [token]);
        }

        res.json({ message: 'Выход выполнен' });
    } catch (err) {
        console.error('Ошибка выхода:', err);
        res.status(500).json({ error: 'Ошибка выхода' });
    }
});

// Проверка токена
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Токен отсутствует' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await dbGet(
            'SELECT id, name, email, avatar, bio, birthdate, online, is_admin, created_at FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        res.json({ user });
    } catch (err) {
        res.status(401).json({ error: 'Недействительный токен' });
    }
});

// Аккаунты на устройстве
router.get('/accounts/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const accounts = await dbAll(`
            SELECT u.id, u.name, u.email, u.avatar 
            FROM users u
            JOIN sessions s ON u.id = s.user_id
            WHERE s.device_id = ?
            GROUP BY u.id
        `, [deviceId]);

        res.json({ accounts });
    } catch (err) {
        console.error('Ошибка получения аккаунтов:', err);
        res.status(500).json({ error: 'Ошибка получения аккаунтов' });
    }
});

module.exports = router;