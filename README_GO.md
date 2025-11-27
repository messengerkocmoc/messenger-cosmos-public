# Kocmoc Messenger (Go)

Эта версия описывает перенос серверной части на Go (Gin + PostgreSQL) с сохранением API, схем БД и поведения текущего Node.js-бэкенда. Документ служит быстрым стартом и шпаргалкой по запуску, конфигурации и дальнейшей доработке Go-сервиса.

## Структура
- `cmd/server` — точка входа (Gin), поднятие HTTP, статика `/uploads` и `/`.
- `internal/config` — загрузка переменных окружения (паритет с Node.js), расчёт TTL для JWT.
- `internal/db` — подключение pgxpool + простые миграции из `internal/db/migrations`.
- `internal/http` — маршруты, соответствующие REST surface (`/api/auth`, `/api/users`, `/api/chats`, `/api/messages`, `/api/files`, `/api/contacts`, `/admin/toggle-maintenance`) с заглушками.
- `internal/http/middleware` — Request-ID, maintenance-режим, JWT guard, совместимый с текущими ответами.
- `internal/auth` — генерация и проверка JWT (HS256, 30 дней по умолчанию), мягкая проверка сессии.
- `internal/realtime` — заготовка WebSocket хаба для переноса событий.
- `internal/crypto/ratchet` — плейсхолдеры X3DH/Double Ratchet под хранение ключей Curve25519/Ed25519 и pre-keys.
- `docs/api/openapi.yaml`, `docs/api/inventory.md`, `docs/api/go-service-blueprint.md` — референсы маршрутов и контрактов.

## Требования
- Go 1.22+
- PostgreSQL 13+ (совместимо с существующей схемой)
- Git, make (опционально)

## Конфигурация окружения
Переменные соответствуют значениям Node.js сервера и имеют дефолты, указанные ниже:

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

Создайте файл `.env` или экспортируйте переменные в сессии перед запуском. Для локальной БД подготовьте пользователя/пароль согласно значениям `PG_USER`/`PG_PASSWORD`.

## Миграции
SQL миграции перенесены из текущей SQLite/Node схемы и лежат в `internal/db/migrations`. При старте `cmd/server` автоматически применяет их в указанной БД PostgreSQL. Для ручного прогона можно вызвать:

```bash
go run cmd/server/main.go # применит миграции и запустит сервер
```

## Запуск сервера
1. Установите зависимости (скачивание модулей может требовать доступ в интернет или настроенный Go proxy):
   ```bash
   go mod download
   ```
2. Запустите сервер:
   ```bash
   go run cmd/server/main.go
   ```
3. API будет доступно на `http://localhost:${PORT}`. Статические файлы и загрузки обслуживаются из `public/` и `uploads/`.

## Тесты
Запуск всех тестов:
```bash
go test ./...
```
> В изолированных окружениях скачивание модулей может быть заблокировано; при необходимости прогрейте `GOPROXY` или добавьте недостающие зависимости в `go.sum` вручную.

## Следующие шаги для продакшен-готовности
- Реализовать реальные хендлеры по контрактам `docs/api/openapi.yaml` и `docs/api/inventory.md`, сохраняя формат ошибок/ответов.
- Добавить уровень доступа к БД (sqlc/GORM) поверх `internal/db` и покрыть сценарии аутентификации, чатов, сообщений, файлов.
- Включить X3DH/Double Ratchet с хранением долгосрочных ключей и pre-keys в БД; шифровать содержимое сообщений перед записью.
- Поднять WebSocket хаб (gorilla/websocket или nhooyr.io/websocket) с push-уведомлениями о сообщениях/статусах.
- Настроить CI/CD, healthchecks и обёртки для катящихся релизов (nginx/Docker/PM2 аналогично Node.js конфигурациям).
