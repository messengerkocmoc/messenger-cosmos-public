# Kocmoc Messenger (Go)

Русскоязычное руководство по серверу на Go (Gin + PostgreSQL), который повторяет API, схемы БД и поведение текущего Node.js-бэкенда. Документ служит быстрым стартом: где лежат модули, как настроить окружение и запустить сервис, а также что ещё осталось довести до продакшена.

## Структура проекта
- `cmd/server` — точка входа (Gin): запуск HTTP, раздача статики из `/uploads` и `/`.
- `internal/config` — загрузка переменных окружения (аналог Node.js), расчёт TTL для JWT.
- `internal/db` — подключение `pgxpool` и простые миграции из `internal/db/migrations`.
- `internal/http` — маршруты REST (`/api/auth`, `/api/users`, `/api/chats`, `/api/messages`, `/api/files`, `/api/contacts`, `/admin/toggle-maintenance`) — пока с заглушками.
- `internal/http/middleware` — Request-ID, maintenance-режим, JWT-guard совместимый с текущими ответами.
- `internal/auth` — генерация и проверка JWT (HS256, 30 дней по умолчанию), мягкая проверка сессии.
- `internal/realtime` — заготовка WebSocket-хаба для переноса событий.
- `internal/crypto/ratchet` — плейсхолдеры X3DH/Double Ratchet под хранение ключей Curve25519/Ed25519 и pre-keys.
- `docs/api/openapi.yaml`, `docs/api/inventory.md`, `docs/api/go-service-blueprint.md` — референсы маршрутов и контрактов.

## Требования
- Go 1.22+
- PostgreSQL 13+ (совместимо с текущей схемой)
- Git, make (опционально)

## Переменные окружения
Совпадают с Node.js-сервером; типичные значения:

```env
PORT=3000
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=kocmoc
PG_USER=kocmoc_user
PG_PASSWORD= # обязательный параметр
PG_SSL=false
JWT_SECRET=your-secret-key-change-in-production
JWT_TTL=30 # дней; опционально
ADMIN_TOKEN= # токен для /admin/toggle-maintenance
MAINTENANCE_FLAG=maintenance.flag
```

Создайте `.env` или экспортируйте переменные в сессии. Для локальной БД создайте пользователя/пароль под `PG_USER`/`PG_PASSWORD`.

## Миграции
SQL-миграции перенесены из текущей схемы и лежат в `internal/db/migrations`. При старте `cmd/server` применяет их автоматически. Ручной запуск:

```bash
go run cmd/server/main.go # прогон миграций и запуск сервера
```

## Запуск
1. Установите зависимости (нужен доступ к прокси/интернету для скачивания модулей):
   ```bash
   go mod download
   ```
2. Запустите сервис:
   ```bash
   go run cmd/server/main.go
   ```
3. API будет доступно на `http://localhost:${PORT}`. Статика и загрузки — из `public/` и `uploads/`.

## Тесты
```bash
go test ./...
```
> В изолированных окружениях загрузка модулей может быть недоступна; при необходимости настройте `GOPROXY` или заполните `go.sum` вручную.

## Что осталось доделать до продакшена
- Реализовать настоящие хендлеры по контрактам `docs/api/openapi.yaml` и `docs/api/inventory.md`, соблюдая формат ошибок/ответов.
- Добавить слой доступа к БД (sqlc/GORM) поверх `internal/db` и покрыть аутентификацию, чаты, сообщения, файлы.
- Включить X3DH/Double Ratchet с хранением долгосрочных ключей и pre-keys в БД; шифровать сообщения перед записью.
- Поднять WebSocket-хаб (gorilla/websocket или nhooyr.io/websocket) с push-уведомлениями о сообщениях и статусах.
- Настроить CI/CD, healthchecks и катящиеся релизы (nginx/Docker/PM2 по аналогии с Node.js конфигами).
