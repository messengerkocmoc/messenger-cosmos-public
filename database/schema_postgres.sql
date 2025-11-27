-- PostgreSQL schema for KOCMOC messenger (final version)
-- Aligns with technical specification: users, chats, chat_members, messages, stories, story_views.

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
    type TEXT NOT NULL CHECK (type IN ('photo', 'video', 'text')),
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

CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id);

-- Message restrictions and safety (anti-spam/text length) should be enforced in application logic.
-- File upload constraints (size, mime-type) are enforced in the upload handler and storage layer.
