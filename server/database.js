const { Pool } = require('pg');
const bcrypt = require('bcrypt');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.PG_HOST || 'localhost',
      port:     parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'kocmoc',
      user:     process.env.PG_USER || 'kocmoc_user',
      password: process.env.PG_PASSWORD || '',
      ssl:      process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

async function initDatabase() {
  const pool = getPool();
  await pool.query('SELECT 1'); // проверка коннекта
  console.log('✅ Подключение к PostgreSQL установлено');

  await createTables();
  await createAdminUser();
}

async function createTables() {
  const pool = getPool();

  const queries = [
    // users
    `
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      name         TEXT        NOT NULL,
      email        TEXT        NOT NULL UNIQUE,
      password     TEXT        NOT NULL,
      avatar       TEXT,
      bio          TEXT,
      birthdate    TEXT,
      online       BOOLEAN     NOT NULL DEFAULT FALSE,
      is_admin     BOOLEAN     NOT NULL DEFAULT FALSE,
      banned       BOOLEAN     NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `,
    // chats
    `
    CREATE TABLE IF NOT EXISTS chats (
      id         SERIAL PRIMARY KEY,
      name       TEXT,
      avatar     TEXT,
      type       TEXT        NOT NULL DEFAULT 'personal',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `,
    // chat_participants
    `
    CREATE TABLE IF NOT EXISTS chat_participants (
      id           SERIAL PRIMARY KEY,
      chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      unread_count INTEGER NOT NULL DEFAULT 0,
      muted        BOOLEAN NOT NULL DEFAULT FALSE,
      archived     BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(chat_id, user_id)
    );
    `,
    // messages
    `
    CREATE TABLE IF NOT EXISTS messages (
      id             SERIAL PRIMARY KEY,
      chat_id        INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id      INTEGER     REFERENCES users(id) ON DELETE SET NULL,
      text           TEXT,
      file_url       TEXT,
      file_name      TEXT,
      file_size      BIGINT,
      file_type      TEXT,
      voice_url      TEXT,
      voice_duration INTEGER,
      message_type   TEXT    NOT NULL DEFAULT 'text',
      status         TEXT    NOT NULL DEFAULT 'sent',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `,
    // contacts
    `
    CREATE TABLE IF NOT EXISTS contacts (
      id          SERIAL PRIMARY KEY,
      owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(owner_id, contact_id)
    );
    `,
    // message_reactions
    `
    CREATE TABLE IF NOT EXISTS message_reactions (
      id          SERIAL PRIMARY KEY,
      message_id  INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reaction    TEXT    NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(message_id, user_id)
    );
    `,
    // devices
    `
    CREATE TABLE IF NOT EXISTS devices (
      id           SERIAL PRIMARY KEY,
      device_id    TEXT    NOT NULL UNIQUE,
      account_count INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `,
    // email_verifications
    `
    CREATE TABLE IF NOT EXISTS email_verifications (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email       TEXT    NOT NULL,
      code        TEXT    NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      used        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `,
    // sessions
    `
    CREATE TABLE IF NOT EXISTS sessions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT    NOT NULL UNIQUE,
      device_id   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    `,
    // stories
    `
    CREATE TABLE IF NOT EXISTS stories (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type         TEXT    NOT NULL,      -- photo / video / text
      content_url  TEXT,
      text         TEXT,
      background   TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ NOT NULL
    );
    `,
    // story_views
    `
    CREATE TABLE IF NOT EXISTS story_views (
      id          SERIAL PRIMARY KEY,
      story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(story_id, user_id)
    );
    `
  ];

  for (const sql of queries) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.error('Ошибка выполнения DDL:', err.message);
    }
  }

  console.log('✅ Таблицы PostgreSQL готовы');
}

async function createAdminUser() {
  const pool = getPool();
  const adminEmail = 'admin@kocmoc.ru';
  const adminPassword = 'adminkocmocmesanger123456789hi';

  const { rows } = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [adminEmail]
  );

  if (rows.length > 0) {
    return;
  }

  const hashed = await bcrypt.hash(adminPassword, 12);
  const avatar = 'https://ui-avatars.com/api/?name=Admin&background=ff3860&color=ffffff&bold=true';

  await pool.query(
    'INSERT INTO users (name, email, password, avatar, is_admin, online) VALUES ($1, $2, $3, $4, true, true)',
    ['Администратор', adminEmail, hashed, avatar]
  );

  console.log('✅ Админ пользователь создан (PostgreSQL)');
}

async function dbRun(sql, params = []) {
  const pool = getPool();
  const isInsert = /^\s*insert/i.test(sql);
  let finalSql = sql;

  if (isInsert && !/returning\s+id/i.test(sql)) {
    finalSql = sql.replace(/;\s*$/, '') + ' RETURNING id';
  }

  const res = await pool.query(finalSql, params);
  const id = res.rows && res.rows[0] && res.rows[0].id ? res.rows[0].id : null;

  return {
    id,
    changes: res.rowCount,
  };
}

async function dbGet(sql, params = []) {
  const pool = getPool();
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

async function dbAll(sql, params = []) {
  const pool = getPool();
  const res = await pool.query(sql, params);
  return res.rows;
}

module.exports = {
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
};
