const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { dbRun, dbGet, dbAll } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
const VERIFICATION_CODE_EXPIRES_MINUTES = parseInt(process.env.VERIFICATION_CODE_EXPIRES_MINUTES || '15', 10);
const TOKEN_TTL = process.env.JWT_TTL || '30d';

let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
} else {
  console.warn('⚠️ EMAIL_USER или EMAIL_PASS не заданы. Отправка почты отключена.');
}

async function sendVerificationEmail(to, code) {
  if (!transporter) {
    throw new Error('Сервис отправки писем не настроен');
  }

  await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject: 'KOCMOC — код подтверждения',
    text: `Ваш код подтверждения: ${code}. Код действует ${VERIFICATION_CODE_EXPIRES_MINUTES} минут.`,
  });
}

async function issueToken(userId) {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  await dbRun('INSERT INTO sessions (user_id, token) VALUES (?, ?)', [userId, token]);
  return token;
}

async function createCode(email, userId) {
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRES_MINUTES * 60 * 1000).toISOString();

  await dbRun(
    `INSERT INTO verification_codes (email, code, user_id, expires_at)
     VALUES (?, ?, ?, ?)`,
    [email, code, userId || null, expiresAt]
  );

  if (transporter) {
    await sendVerificationEmail(email, code);
  }

  return code;
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, display_name, avatar_url } = req.body;
    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'Укажите email, пароль и имя' });
    }

    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const userInsert = await dbRun(
      `INSERT INTO users (email, password_hash, display_name, avatar_url, online)
       VALUES (?, ?, ?, ?, TRUE)`,
      [email, password_hash, display_name, avatar_url || null]
    );

    await createCode(email, userInsert.id);
    return res.status(201).json({ message: 'Регистрация успешна, код подтверждения отправлен', userId: userInsert.id });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    return res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Не указан email' });
    }

    const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await createCode(email, user.id);
    res.json({ message: 'Код отправлен' });
  } catch (err) {
    console.error('Ошибка отправки кода:', err);
    res.status(500).json({ error: 'Ошибка отправки кода' });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Не указан email или код' });
    }

    const latest = await dbGet(
      `SELECT * FROM verification_codes
       WHERE email = ? AND code = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, code]
    );

    if (!latest) {
      return res.status(400).json({ error: 'Неверный код' });
    }

    if (latest.used) {
      return res.status(400).json({ error: 'Код уже использован' });
    }

    if (new Date(latest.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Срок действия кода истёк' });
    }

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [latest.user_id]);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    await dbRun('UPDATE verification_codes SET used = TRUE WHERE id = ?', [latest.id]);
    const token = await issueToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error('Ошибка подтверждения кода:', err);
    res.status(500).json({ error: 'Ошибка подтверждения кода' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Укажите email и пароль' });
    }

    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = await issueToken(user.id);
    await dbRun('UPDATE users SET online = TRUE, last_seen = NOW() WHERE id = ?', [user.id]);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

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

module.exports = router;
