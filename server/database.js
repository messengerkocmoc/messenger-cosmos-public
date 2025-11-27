const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      database: process.env.PG_DATABASE || 'kocmoc',
      user: process.env.PG_USER || 'kocmoc_user',
      password: process.env.PG_PASSWORD || '',
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

async function initDatabase() {
  const pool = getPool();
  await pool.query('SELECT 1');
  console.log('✅ Подключение к PostgreSQL установлено');

  await createTables();
  await ensureAdminUser();
}

async function createTables() {
  const pool = getPool();

  const schemaPath = path.join(__dirname, '..', 'database', 'schema_postgres.sql');
  let ddl = '';

  if (fs.existsSync(schemaPath)) {
    ddl = fs.readFileSync(schemaPath, 'utf-8');
  } else {
    ddl = `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        online BOOLEAN NOT NULL DEFAULT FALSE,
        last_seen TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS chats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        is_group BOOLEAN NOT NULL DEFAULT FALSE,
        name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS chat_members (
        chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (chat_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        text TEXT,
        file_url TEXT,
        audio_url TEXT,
        sticker_url TEXT,
        edited BOOLEAN NOT NULL DEFAULT FALSE,
        deleted BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at ON messages(chat_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS stories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('photo','video','text')),
        media_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS story_views (
        story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (story_id, viewer_id)
      );
      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
  }

  const statements = ddl
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.error('Ошибка выполнения DDL:', err.message);
    }
  }

  console.log('✅ Таблицы PostgreSQL готовы');
}

async function ensureAdminUser() {
  const pool = getPool();
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@kocmoc.ru';
  const adminPassword = process.env.ADMIN_PASSWORD || 'adminkocmocmesanger123456789hi';

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (rows.length > 0) {
    return;
  }

  const hashed = await bcrypt.hash(adminPassword, 12);
  const avatar = 'https://ui-avatars.com/api/?name=Admin&background=7c3aed&color=ffffff&bold=true';

  await pool.query(
    `INSERT INTO users (email, password_hash, display_name, avatar_url, online)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [adminEmail, hashed, 'Администратор', avatar]
  );

  console.log('✅ Админ пользователь создан (PostgreSQL)');
}

function normalizePlaceholders(sql = '') {
  let counter = 0;
  return sql.replace(/\?/g, () => {
    counter += 1;
    return `$${counter}`;
  });
}

async function dbRun(sql, params = []) {
  const pool = getPool();
  const isInsert = /^\s*insert/i.test(sql);
  let finalSql = normalizePlaceholders(sql);

  if (isInsert && !/returning\s+id/i.test(finalSql)) {
    finalSql = finalSql.replace(/;\s*$/, '') + ' RETURNING id';
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
  const res = await pool.query(normalizePlaceholders(sql), params);
  return res.rows[0] || null;
}

async function dbAll(sql, params = []) {
  const pool = getPool();
  const res = await pool.query(normalizePlaceholders(sql), params);
  return res.rows;
}

module.exports = {
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
};
