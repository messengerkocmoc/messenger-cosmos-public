# API и схема данных (текущий сервер Node.js)

## REST маршруты
### /api/auth
- **POST /register** — регистрация пользователя, увеличивает счетчик устройств, кладёт запись в `email_verifications`, возвращает `userId`, `email`, сообщение об отправке кода.
- **POST /verify-email** — принимает `userId`, `code`, `deviceId`; помечает код как использованный, создаёт JWT (30d) и сессию в `sessions`, возвращает объект `user`, `token`, сообщение.
- **POST /resend-code** — повторно шлёт 6-значный код подтверждения email.
- **POST /login** — проверка пары email/пароль, запрет входа при наличии неподтверждённого кода, выдаёт JWT (30d) и пишет сессию с `device_id`.
- **POST /logout** — удаляет сессию по токену из заголовка Authorization.
- **GET /verify** — валидирует JWT, возвращает краткий профиль пользователя.
- **GET /accounts/:deviceId** — возвращает список аккаунтов, вошедших с указанного `device_id`.

### /api/users (требует JWT)
- **GET /** — список пользователей (кроме текущего).
- **GET /:id** — профиль пользователя.
- **PUT /:id** — обновление `name`, `avatar`, `bio`, `birthdate` (только владелец или админ).
- **GET /admin/stats** — админская статистика по `users`, `chats`, `messages`, `devices`.
- **GET /admin/devices** — список устройств с `account_count`.
- **PUT /admin/devices/:deviceId/reset** — сброс счётчика устройства.
- **PUT /:id/ban** — бан пользователя (удаляет сессии), админ.
- **PUT /:id/unban** — разблокировка пользователя, админ.
- **DELETE /:id** — удаление пользователя, админ.
- **GET /search/:query** — поиск по имени/email, минимум 2 символа.

### /api/contacts (требует JWT)
- **GET /** — список контактов текущего пользователя.
- **POST /add** — добавление контакта (`userId`/`contactId`), игнорирует дубликаты.
- **POST /remove** — удаление контакта.

### /api/chats (требует JWT)
- **GET /** — чаты пользователя с полями unread/muted/archived, последним сообщением.
- **POST /** — создание личного или группового чата. Для `type=personal` ищет существующий чат между двумя пользователями.
- **GET /:id** — получение чата с участниками, проверяет участие пользователя.
- **PUT /:id** — обновление `muted`, `archived`, `unread_count` в `chat_participants` для текущего пользователя.
- **DELETE /:id** — удаление чата (только участники).

### /api/messages (требует JWT)
- **GET /:chatId** — выборка сообщений по чату (`limit`, `offset`), проверка участия.
- **POST /:chatId** — отправка сообщения (`text`, `message_type`, `file_*`, `voice_*`), инкрементирует `unread_count` другим участникам, возвращает созданное сообщение.
- **POST /:messageId/react** — добавление/замена реакции (таблица `message_reactions`), 501 если таблица недоступна.
- **DELETE /:messageId/react** — удаление реакции.
- **PUT /:chatId/read** — обнуляет `unread_count` для пользователя.
- **DELETE /:id** — удаление сообщения (отправитель или админ).
- **GET /:chatId/search?q=** — поиск сообщений по тексту (min 2 символа) внутри чата.

### /api/files
- **POST /upload** (JWT) — загрузка файла/голоса через multipart `file`, сохраняет под `uploads/files|voice`, возвращает мета `{id, originalName, size, mimetype, path, url}`.
- **GET /:fileId** — отдаёт файл из `uploads/voice|files` с корректным MIME.
- **DELETE /:fileId** (JWT) — удаляет файл с диска.

### /admin/maintenance
- **POST /toggle-maintenance** — включает/выключает флаг `maintenance.flag` при заголовке `x-admin-token` или `admin_token` query.

## Ответы и ошибки
- Успешные ответы возвращают JSON-объекты с полями сущности + `message`/`token`/`success`.
- Ошибки отдают `{ error: string }` с соответствующими HTTP-кодами (400 валидация, 401 токен, 403 права, 404 не найдено, 500/501 системные).

## WebSocket/реалтайм
- В текущем Node.js сервере WS не реализован. Реалтайм обновления предполагается перенести в Go (gorilla/websocket или nhooyr.io/websocket) с сохранением протокола событий из клиента.

## JWT/сессии
- Секрет: `JWT_SECRET` (env), срок: 30 дней (`jwt.sign({userId}, secret, { expiresIn: '30d' })`).
- Сессии записываются в таблицу `sessions` вместе с `device_id`; логаут удаляет запись по токену.

## Схема БД (PostgreSQL)
Создаётся при старте через `server/database.js`:
- **users**: `id SERIAL PK`, `name`, `email UNIQUE`, `password`, `avatar`, `bio`, `birthdate`, `online BOOL`, `is_admin BOOL`, `banned BOOL`, `created_at TIMESTAMPTZ`.
- **chats**: `id SERIAL PK`, `name`, `avatar`, `type` (personal/group), `created_at`.
- **chat_participants**: `id SERIAL PK`, `chat_id FK chats`, `user_id FK users`, `unread_count INT`, `muted BOOL`, `archived BOOL`, `UNIQUE(chat_id, user_id)`.
- **messages**: `id SERIAL PK`, `chat_id FK chats`, `sender_id FK users NULLABLE`, `text`, `file_url`, `file_name`, `file_size BIGINT`, `file_type`, `voice_url`, `voice_duration`, `message_type`, `status`, `created_at`.
- **contacts**: `id SERIAL PK`, `owner_id FK users`, `contact_id FK users`, `created_at`, `UNIQUE(owner_id, contact_id)`.
- **message_reactions**: `id SERIAL PK`, `message_id FK messages`, `user_id FK users`, `reaction`, `created_at`, `UNIQUE(message_id, user_id)`.
- **devices**: `id SERIAL PK`, `device_id UNIQUE`, `account_count INT`, `created_at`.
- **email_verifications**: `id SERIAL PK`, `user_id FK users`, `email`, `code`, `expires_at`, `used BOOL`, `created_at`.
- **sessions**: `id SERIAL PK`, `user_id FK users`, `token UNIQUE`, `device_id`, `created_at`.
- **stories**: `id SERIAL PK`, `user_id FK users`, `type`, `content_url`, `text`, `background`, `created_at`, `expires_at`.
- **story_views**: `id SERIAL PK`, `story_id FK stories`, `user_id FK users`, `viewed_at`, `UNIQUE(story_id, user_id)`.

## Файлы и статическая раздача
- Статика из `public/` и `uploads/` (подпапки `files/`, `voice/`).
- SPA fallback отправляет `public/index.html` для всех необработанных роутов.

## Ограничения
- Профилактика: при наличии `maintenance.flag` все запросы (кроме статики и /admin) получают страницу 503.
- Лимит устройств: максимум 3 аккаунта на `device_id` при регистрации.

## Наблюдения для миграции на Go
- Поведение ошибок и сообщений строится на ключе `error` или `message` в JSON; нужно сохранить формат.
- JWT экспирация и запись в `sessions` должны совпадать.
- Отсутствует реализация WebSocket и шифрования — можно внедрять новую реализацию без изменения API поверх REST/WS контракта.
