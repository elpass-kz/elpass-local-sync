# Elpass Syncer Local

Локальный backend-сервис для синхронизации карт доступа с терминалами Hikvision/Dahua. Работает полностью на сервере клиента через Docker.

## Требования

- Docker и Docker Compose
- Сетевой доступ к терминалам (одна локальная сеть)

## Быстрый старт

### 1. Настроить окружение

```bash
cp .env.example .env
```

Заполнить в `.env`:

| Переменная | Описание |
|---|---|
| `POSTGRES_PASSWORD` | Любой надежный пароль для локальной БД |
| `PGRST_JWT_SECRET` | Случайная строка, минимум 32 символа (`openssl rand -hex 32`) |

Остальное можно оставить по умолчанию.

### 2. Запуск

```bash
docker-compose up -d
```

Запускаются 4 контейнера:

| Контейнер | Порт | Описание |
|---|---|---|
| PostgreSQL | 5432 | База данных (инициализируется автоматически при первом запуске) |
| PostgREST | 3000 | REST API поверх базы данных |
| PicServer | 9000 | Загрузка и хранение фотографий |
| Backend API | 3001 | Основной сервис, с которым работает фронтенд |

### 3. Зарегистрировать терминалы

Добавить терминалы Hikvision/Dahua в базу данных. Пример через PostgREST:

```bash
curl http://localhost:3000/el_tdir_terminals \
  -H "Authorization: Bearer <токен>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://192.168.1.100",
    "name": "Вход 1",
    "type": "hik",
    "online": true,
    "disabled": false,
    "host": "app",
    "meta_": {
      "objectGuid": "object-1",
      "zone": "1",
      "username": "admin",
      "password": "пароль-терминала"
    }
  }'
```

Или напрямую через SQL:
```bash
docker exec -it elpass-local-db psql -U elpass -d elpass
```

### 4. Подключить фронтенд

Направить фронтенд на `http://<ip-сервера>:3001`. Все запросы идут на `/api/cards` с заголовком `Authorization: Bearer <JWT>`. В payload JWT должен быть `host`.

## Как это работает

1. **Backend стартует** — автоматически генерирует сервисный токен для PostgREST из `PGRST_JWT_SECRET`
2. **Фронтенд отправляет запрос** — например `POST /api/cards` с данными карты и фото
3. **Backend обрабатывает:**
   - Загружает фото в PicServer
   - Сохраняет карту в PostgreSQL (через PostgREST)
   - Находит подходящие терминалы из БД (по `host` и `zones`)
   - Синхронизирует карту и фото на каждый терминал через Hikvision ISAPI или Dahua CGI-BIN
4. **Синхронизация с терминалами** — операции create/update/delete с mutual fallback паттерном

## API

### Карты

| Метод | Endpoint | Описание |
|---|---|---|
| `GET` | `/api/cards` | Список карт (с фильтрами) |
| `POST` | `/api/cards` | Создать карту + синхронизация с терминалами |
| `PATCH` | `/api/cards/:uuid` | Обновить карту + повторная синхронизация |
| `DELETE` | `/api/cards/:uuid` | Мягкое удаление + удаление с терминалов |
| `POST` | `/api/cards/:uuid/sync` | Ре-синхронизация одной карты с терминалами |
| `POST` | `/api/cards/sync-batch` | Пакетная синхронизация карт (по UUIDs или group_id, макс. 100) |
| `POST` | `/api/cards/restore-terminal` | Восстановление всех карт на терминал после сброса |

---

### GET /api/cards

Получает список карт с фильтрацией и пагинацией.

**Query параметры:**

| Параметр | Тип | Описание |
|---|---|---|
| `name` | string | Поиск по имени (частичное совпадение) |
| `group` | string | Фильтр по группе |
| `created_at` | string | Фильтр по дате создания |
| `page` | number | Номер страницы |
| `size` | number | Размер страницы |
| `showDeletedCards` | boolean | Включить удаленные карты |

**Ответ:**
```json
{
  "success": true,
  "cards": [...],
  "total": 42
}
```

---

### POST /api/cards

Создает карту, загружает фото и синхронизирует с терминалами.

**Заголовки:**
```
Authorization: Bearer <JWT с host в payload>
```

**Body (multipart/form-data):**

| Поле | Обязательное | Описание |
|---|---|---|
| `name` | Да | Имя владельца карты |
| `no` | Да | Номер карты |
| `photo` | Да (кроме guest) | Фото (рекомендуется JPEG) |
| `passType` | Нет | `permanent`, `guest` или `blocked` |
| `zones` | Нет | JSON массив зон, по умолчанию `["all"]` |
| `begin_at` | Нет | Дата начала (по умолчанию: сейчас) |
| `end_at` | Нет | Дата окончания (по умолчанию: +10 лет, обязательно для guest) |
| `group` | Нет | ID группы |
| `objectGuid` | Нет | ID объекта |
| `entranceNumber` | Нет | Номер подъезда (используется как зона если zones не указан) |

**Ответ:**
```json
{
  "success": true,
  "uuid": "card-uuid",
  "photoPath": "group/12345.jpg",
  "pin": "1234",
  "syncStatus": {
    "card": { "success": true, "operations": [...] },
    "photo": { "success": true, "operations": [...] }
  }
}
```

> `pin` возвращается только для `passType: "guest"`

---

### PATCH /api/cards/:uuid

Обновляет существующую карту и повторно синхронизирует с терминалами.

**Body (multipart/form-data):**

| Поле | Описание |
|---|---|
| `name` | Имя владельца |
| `photo` | Новое фото |
| `passType` | `permanent`, `guest` или `blocked` |
| `zones` | JSON массив зон |
| `begin_at` | Дата начала |
| `end_at` | Дата окончания |
| `group` | ID группы |
| `isDisabled` | Отключить карту |

> Номер карты (`no`) изменить нельзя.

**Ответ:** аналогичен POST /api/cards

---

### DELETE /api/cards/:uuid

Мягкое удаление карты (soft delete) и удаление с терминалов.

**Ответ:**
```json
{
  "success": true,
  "uuid": "card-uuid",
  "syncStatus": {
    "card": { "success": true, "operations": [...] }
  }
}
```

---

### POST /api/cards/:uuid/sync

Повторная синхронизация одной карты с терминалами. Используется после ошибок или обновления данных. Включает lock-механизм — параллельные запросы на одну карту ждут результат первого.

**Body:** не требуется

**Ответ:**
```json
{
  "success": true,
  "status": { "terminal-id": { "card": "ok", "photo": "ok" } },
  "syncStatus": {
    "card": { "success": true, "operations": [...] },
    "photo": { "success": true, "operations": [...] }
  }
}
```

---

### POST /api/cards/sync-batch

Пакетная синхронизация нескольких карт. Максимум 100 карт, обрабатываются по 5 параллельно. Карты с `isOK: true` пропускаются.

**Body (JSON):**

| Поле | Описание |
|---|---|
| `uuids` | Массив UUID карт (макс. 100) |
| `group_id` | ID группы (альтернатива uuids) |
| `objectGuid` | ID объекта (режим бронирования) |
| `guid` | GUID резидента (обязательно при objectGuid) |
| `zone` | Зона для добавления |
| `deleteZone` | Зона для удаления |
| `begin_at` | Переопределить дату начала |
| `end_at` | Переопределить дату окончания |

> Нужно указать хотя бы один фильтр: `uuids`, `group_id`, `objectGuid`, `guid` или `zone`.

**Ответ:**
```json
{
  "success": true,
  "summary": { "total": 10, "succeeded": 8, "failed": 1, "skipped": 1 },
  "results": [
    { "uuid": "...", "success": true, "status": {...} },
    { "uuid": "...", "success": false, "error": "..." }
  ]
}
```

---

### POST /api/cards/restore-terminal

Восстанавливает все карты на терминал из БД. Используется когда терминал был сброшен или очищен.

**Body (JSON):**
```json
{
  "terminalId": "terminal-uuid"
}
```

> Терминал должен иметь `zone` в `meta_`.

**Ответ:**
```json
{
  "success": true,
  "terminal": { "id": "...", "name": "...", "zone": "1" },
  "summary": { "total": 10, "succeeded": 10, "failed": 0, "skipped": 0 },
  "results": [...]
}
```

## Типы терминалов

| Тип | Значение | Протокол |
|---|---|---|
| Hikvision | `hik` или `H` | ISAPI |
| Dahua | `dah` или `D` | CGI-BIN |

## Зоны терминалов

Терминалам назначаются зоны через `meta_.zone`. Карты синхронизируются с терминалами, чья зона совпадает с зонами карты. Общие зоны (`gate`, `parking`) автоматически включаются для всех карт.

## Доступ к базе данных

```bash
# Через CLI
docker exec -it elpass-local-db psql -U elpass -d elpass

# Через GUI (pgAdmin, DBeaver, TablePlus и т.д.)
# Host: localhost, Port: 5432, DB: elpass, User: elpass
```

## Команды

```bash
# Запустить
docker-compose up -d

# Остановить
docker-compose down

# Остановить и удалить все данные
docker-compose down -v

# Пересобрать после изменений кода
docker-compose up -d --build

# Посмотреть логи
docker-compose logs -f terminals-api
```

## Структура проекта

```
src/
├── config/           # Конфигурация окружения
├── middleware/        # JWT авторизация, обработка ошибок
├── routes/           # API маршруты
├── controllers/      # Обработчики запросов
├── services/         # Бизнес-логика
│   ├── hik/          # Hikvision ISAPI сервисы
│   └── dahua/        # Dahua CGI-BIN сервисы
├── models/           # TypeScript модели
├── types/            # TypeScript типы
└── utils/            # Утилиты
db/
└── init.sql          # Схема БД (выполняется автоматически при первом запуске)
picserver/            # Сервис хранения фотографий
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `NODE_ENV` | `production` | Окружение |
| `PORT` | `3001` | Порт Backend API |
| `LOG_LEVEL` | `info` | Уровень логирования |
| `POSTGRES_DB` | `elpass` | Название базы данных |
| `POSTGRES_USER` | `elpass` | Пользователь БД |
| `POSTGRES_PASSWORD` | — | **Обязательно** |
| `PGRST_JWT_SECRET` | — | **Обязательно** (мин. 32 символа) |
| `TERMINAL_REQUEST_TIMEOUT` | `30000` | Таймаут запроса к терминалу (мс) |
| `RETRY_MAX_ATTEMPTS` | `3` | Количество повторных попыток |
| `RETRY_DELAY_MS` | `1000` | Задержка между попытками (мс) |
