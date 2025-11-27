# Go-сервис (черновик)

## Структура
- `cmd/server` — точка входа, поднимает Gin, подключает PostgreSQL через pgxpool, применяет миграции из `internal/db/migrations`, монтирует статику (`/uploads`, `/`).
- `internal/config` — загрузка env (`PG_*`, `JWT_SECRET`, `ADMIN_TOKEN`, `MAINTENANCE_FLAG`, `PORT`).
- `internal/db` — подключение к БД и простой мигратор, совместимый со схемой legacy.
- `internal/auth` — генерация/проверка JWT с TTL 30 дней, мягкая проверка сессии в таблице `sessions`.
- `internal/http` — маршруты, воспроизводящие surface REST API (`/api/auth`, `/api/users`, `/api/chats`, `/api/messages`, `/api/files`, `/api/contacts`, `/admin/toggle-maintenance`). Пока возвращают 501-style ответ через плейсхолдер.
- `internal/http/middleware` — Request-ID, проверка maintenance-флага, JWT-guard с сообщениями в стиле legacy.
- `internal/validation` — обёртка над go-playground/validator для единообразных 400 ошибок.
- `internal/realtime` — заготовка hub для переноса WebSocket-протокола.
- `internal/crypto/ratchet` — заглушки под X3DH и Double Ratchet (долгосрочные ключи Curve25519/Ed25519, одноразовые pre-keys), готовые к замене на `github.com/otrv4/axolotl` или собственную реализацию.

## Совместимость с Node.js API
- Маршруты и методы полностью совпадают с текущими: `/api/auth/*`, `/api/users/*`, `/api/contacts/*`, `/api/chats/*`, `/api/messages/*`, `/api/files/*`, `/admin/toggle-maintenance`.
- Формат ошибок: `{ "error": string }`; успешные ответы используют `{ "message": string }` + полезную нагрузку.
- JWT: HMAC-SHA256, срок 30 дней, поле `userId` в клеймах, аналогично `server/middleware/auth.js`.
- Миграции переносят всю структуру таблиц из `server/database.js`, включая реакции, stories и sessions.

## Следующие шаги
1. Подключить реальную ORM/SQL-слой (sqlc/gorm) и описать сущности/репозитории вокруг `internal/db`.
2. Реализовать хендлеры на основе контрактов из `docs/api/openapi.yaml` и `docs/api/inventory.md`, сохраняя текущее поведение ошибок.
3. Добавить регистрацию/вход с созданием сессий и очисткой по логауту.
4. Внедрить X3DH/Double Ratchet, хранение ключей в БД и шифрование полей сообщений перед записью.
5. Поднять WebSocket хаб (gorilla/websocket или nhooyr.io/websocket) с push событий для сообщений/реакций/статусов.
6. Завести интеграционные и E2E тесты (в том числе ратчет), сравнивающие ответы с текущим Node.js сервером.
