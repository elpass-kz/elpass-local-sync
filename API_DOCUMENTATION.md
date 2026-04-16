# API Documentation - Elpass Terminals Backend

## Обзор

Этот проект - это **прокси-сервис** между frontend приложением и терминалами контроля доступа (Hikvision/Dahua).

```
Frontend (elpass-vuejs)
    ↓ HTTP запрос с заголовками
Backend Proxy (elpass-terminals-backend)
    ↓ Прямой ISAPI вызов
Hikvision/Dahua Terminal (физическое устройство)
```

## Архитектура

### Поток запроса

1. **Точка входа** - `src/app.ts:12`
   - Все запросы идут на `/terminals`

2. **Роутер** - `src/routes/terminals.ts:22-33`
   - Поддерживает методы: POST, PUT, DELETE, GET
   - Все методы обрабатываются через один эндпоинт

3. **Валидация** - `src/middleware/headerValidator.ts`
   - Проверяет обязательные заголовки

4. **Контроллер** - `src/controllers/TerminalProxyController.ts`
   - Извлекает заголовки и тело запроса
   - Роутит запросы по модулям и методам

5. **Сервисы** - `src/services/hik/`
   - `HikCardService` - управление картами
   - `HikPhotoService` - управление фотографиями
   - `TerminalClientService` - HTTP клиент для терминалов

## API Endpoints

### Base URL
```
http://localhost:3001/terminals
```

### Обязательные заголовки

| Заголовок | Описание | Пример |
|-----------|----------|--------|
| `X-Terminal` | URL терминала | `http://192.168.1.100` |
| `X-Module` | Модуль операции | `card`, `face`, `fizcard`, `cards` |
| `X-Type` | Тип терминала | `hik`, `H` |
| `X-Creds` | Base64 credentials | `YWRtaW46YWRtaW4xMjM=` |
| `Content-Type` | Тип контента | `application/json` |

### Как получить X-Creds

Base64 кодирование `username:password`:
```bash
echo -n "admin:admin123" | base64
# Результат: YWRtaW46YWRtaW4xMjM=
```

## Модули API

### 1. Управление картами (card)

#### Создать карту
```
POST /terminals
X-Module: card
```

**Минимальный запрос:**
```json
{
  "no": "12345",
  "name": "John Doe",
  "isBlocked": false
}
```

**Полный запрос с опциями:**
```json
{
  "no": "12345",
  "name": "John Doe",
  "isBlocked": false,
  "begin_at": "2026-01-13T00:00:00",
  "end_at": "2027-01-13T23:59:59",
  "meta_": {
    "pin": "1234",
    "zone": "nexpo"
  }
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    // Hikvision response data
  }
}
```

#### Обновить карту
```
PUT /terminals
X-Module: card

Body: (тот же формат что и для создания)
```

#### Удалить карту
```
DELETE /terminals
X-Module: card

Body:
{
  "no": "12345"
}
```

### 2. Физическая карта (fizcard)

#### Создать физическую карту
```
POST /terminals
X-Module: fizcard

Body:
{
  "no": "12345"
}
```

### 3. Управление фотографиями (face)

#### Добавить фото
```
POST /terminals
X-Module: face

Body:
{
  "no": "12345",
  "name": "John Doe",
  "photo": "base64_encoded_image_or_url"
}
```

#### Обновить фото
```
PUT /terminals
X-Module: face

Body: (тот же формат)
```

#### Удалить фото
```
DELETE /terminals
X-Module: face

Body:
{
  "no": "12345"
}
```

### 4. Получение списка карт (cards)

#### Получить все карты
```
GET /terminals
X-Module: cards
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    { "employeeNo": "12345" },
    { "employeeNo": "67890" }
  ]
}
```

#### Удалить все карты
```
DELETE /terminals
X-Module: cards
```

## Примеры запросов

### Postman: Создание карты

**Request:**
```
POST http://localhost:3001/terminals

Headers:
X-Terminal: http://192.168.1.100
X-Module: card
X-Type: hik
X-Creds: YWRtaW46YWRtaW4xMjM=
Content-Type: application/json

Body:
{
  "no": "1766074569319",
  "name": "Test User",
  "isBlocked": false,
  "meta_": {
    "pin": "1234"
  }
}
```

### cURL: Создание карты

```bash
curl -X POST http://localhost:3001/terminals \
  -H "X-Terminal: http://192.168.1.100" \
  -H "X-Module: card" \
  -H "X-Type: hik" \
  -H "X-Creds: YWRtaW46YWRtaW4xMjM=" \
  -H "Content-Type: application/json" \
  -d '{
    "no": "12345",
    "name": "John Doe",
    "isBlocked": false
  }'
```

## Модели данных

### Card Model
```typescript
{
  no: string | number;           // Номер карты (обязательно)
  name: string;                  // Имя (обязательно)
  isBlocked: boolean;            // Статус блокировки (обязательно)
  begin_at?: string | Date;      // Дата начала действия
  end_at?: string | Date;        // Дата окончания действия
  photo?: string;                // Фото (base64 или URL)
  meta_?: {
    pin?: string;                // PIN код
    zone?: string;               // Зона доступа
  }
}
```

### Terminal Model
```typescript
{
  url: string;                   // URL терминала
  type: "H";                     // Тип (H = Hikvision)
  meta_?: {
    username?: string;
    password?: string;
    zone?: string;
  }
}
```

## Логика работы

### Обработка авторизации

1. Frontend отправляет заголовок `X-Creds` с base64-кодированными `username:password`
2. `TerminalProxyController` декодирует credentials:
   ```typescript
   const { username, password } = decodeCredentials(creds);
   ```
3. Credentials помещаются в объект terminal:
   ```typescript
   const terminal: Terminal = {
     url: terminalUrl,
     type: normalizeType(type),
     meta_: { username, password }
   };
   ```
4. Сервисы (`HikCardService`, `HikPhotoService`) создают base64Creds внутренне:
   ```typescript
   private getCredentials(terminal: Terminal): string {
     const username = terminal.meta_?.username;
     const password = terminal.meta_?.password;

     if (!username || !password) {
       throw new Error("Terminal credentials are required");
     }

     return formatCredentials(username, password);
   }
   ```

### Создание карты (createCard)

1. Frontend отправляет объект Card
2. Backend получает Card и строит UserInfo для Hikvision:
   ```typescript
   const UserInfo = {
     employeeNo: card.no.toString(),
     name: card.name,
     gender: "male",
     userType: card.isBlocked ? "blackList" : "normal",
     Valid: {
       enable: true,
       beginTime: formatDateForHik(startTime),
       endTime: formatDateForHik(endTime)
     },
     doorRight: "1",
     RightPlan: [{ doorNo: 1, planTemplateNo: "1" }]
   };
   ```
3. Делает запрос к терминалу:
   ```
   POST http://{terminal_ip}/ISAPI/AccessControl/UserInfo/SetUp?format=json
   Authorization: Basic {credentials}
   Body: { UserInfo }
   ```
4. Создает физическую карту:
   ```
   POST http://{terminal_ip}/ISAPI/AccessControl/CardInfo/SetUp?format=json
   Body: { CardInfo }
   ```
5. Возвращает результат

### Специальные правила

#### Зоны доступа
Для хоста `ast-yourt` и зоны `nexpo` автоматически настраиваются 2 двери:
```typescript
if (host === "ast-yourt" && terminal.meta_?.zone === "nexpo") {
  UserInfo.doorRight = "1,2";
  UserInfo.RightPlan = [
    { doorNo: 1, planTemplateNo: "1" },
    { doorNo: 2, planTemplateNo: "1" }
  ];
}
```

#### PIN код
Если указан PIN, добавляется возможность входа по паролю:
```typescript
if (card.meta_?.pin) {
  UserInfo.userVerifyMode = "cardOrfaceOrPw";
  UserInfo.password = card.meta_.pin;
}
```

## Обработка ошибок

### Карта уже существует
```json
{
  "success": true,
  "subStatusCode": "cardNoAlreadyExist",
  "data": {...}
}
```

### Пользователь не найден (при обновлении)
Backend автоматически пытается создать карту:
```typescript
if (err.response?.data?.subStatusCode === "employeeNoNotExist") {
  return this.createCard(card, terminal);
}
```

### SSL/TLS ошибка
```
Error: write EPROTO ... WRONG_VERSION_NUMBER
```
**Причина:** Неправильный протокол в X-Terminal (https вместо http)
**Решение:** Используйте `http://` вместо `https://`

### Invalid URL
```
TypeError: Invalid URL
```
**Причина:** X-Terminal заголовок не содержит валидный URL
**Решение:** Используйте полный URL: `http://192.168.1.100`

## Конфигурация

### Environment Variables (.env)
```bash
NODE_ENV=development
PORT=3001
TERMINAL_REQUEST_TIMEOUT=30000
RETRY_MAX_ATTEMPTS=3
RETRY_DELAY_MS=1000
PIC_SERVER=http://localhost:9000/pic
```

## Запуск проекта

```bash
# Установка зависимостей
npm install

# Разработка
npm run dev

# Продакшн
npm run build
npm start
```

## Важные замечания

1. **Не отправляйте готовый UserInfo** в body
   - ❌ Неправильно: `{ UserInfo: { employeeNo, name, ... } }`
   - ✅ Правильно: `{ no, name, isBlocked }`

2. **URL терминала должен быть полным**
   - ❌ `X-Terminal: 192.168.1.100`
   - ✅ `X-Terminal: http://192.168.1.100`

3. **X-Creds должен быть base64**
   - Не отправляйте plain text credentials
   - Используйте: `btoa("username:password")`

4. **Backend не хранит данные**
   - Это прокси-сервис
   - Все данные хранятся на терминалах

## Поддерживаемые терминалы

- ✅ Hikvision (тип: `hik` или `H`)
- ❌ Dahua (в данный момент не поддерживается в этой версии)
