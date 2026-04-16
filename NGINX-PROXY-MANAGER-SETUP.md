wh# Настройка HTTPS через Nginx Proxy Manager

## 📋 Шаг 1: Настройте DNS

В панели управления доменом `terminals.kz` создайте A-запись:

```
Type: A
Name: api
TTL: 3600 (или Auto)
Value: 5.35.108.75
```

**Проверьте DNS** (подождите 5-10 минут после создания):

```bash
dig +short api.terminals.kz
# Должен вернуть: 5.35.108.75
```

## 🌐 Шаг 2: Настройте Nginx Proxy Manager

### 2.1. Войдите в Nginx Proxy Manager

Откройте в браузере:

```
http://5.35.108.75:8081
```

Логин по умолчанию (если не менялся):

- **Email**: `admin@example.com`
- **Password**: `changeme`

### 2.2. Добавьте Proxy Host

1. Нажмите **"Proxy Hosts"** (в верхнем меню)
2. Нажмите **"Add Proxy Host"** (синяя кнопка)

### 2.3. Вкладка "Details"

Заполните поля:

- **Domain Names**: `api.terminals.kz`
- **Scheme**: `http`
- **Forward Hostname/IP**: `elpass-terminals-api`
  > Это имя Docker контейнера. Nginx Proxy Manager находится в той же Docker сети.
- **Forward Port**: `3001`

Включите опции:

- ✅ **Cache Assets**
- ✅ **Block Common Exploits**
- ✅ **Websockets Support**

### 2.4. Вкладка "SSL"

Настройте SSL сертификат:

- **SSL Certificate**: выберите из выпадающего списка **"Request a new SSL Certificate"**

Включите опции:

- ✅ **Force SSL** (редирект HTTP → HTTPS)
- ✅ **HTTP/2 Support**
- ✅ **HSTS Enabled**

Заполните:

- **Email Address for Let's Encrypt**: `admin@terminals.kz` (или ваш email)
- ✅ **I Agree to the Let's Encrypt Terms of Service**

### 2.5. Сохраните

Нажмите **"Save"**

Nginx Proxy Manager автоматически:

- Получит SSL сертификат от Let's Encrypt
- Настроит HTTPS
- Будет автоматически обновлять сертификат

## ✅ Шаг 3: Проверьте работу

### 3.1. Проверка через браузер

Откройте:

```
https://api.terminals.kz/health
```

Должен вернуть:

```json
{
  "success": true,
  "message": "Service is healthy",
  "timestamp": "2026-01-22T12:00:00.000Z"
}
```

### 3.2. Проверка через curl

```bash
# Проверка HTTPS
curl https://api.terminals.kz/health

# Проверка редиректа HTTP → HTTPS
curl -I http://api.terminals.kz/health
# Должен вернуть: 301 Moved Permanently → https://api.terminals.kz
```

## 🎨 Шаг 4: Обновите фронтенд

В проекте `elpass-vuejs` измените базовый URL API:

```javascript
// Было:
const API_URL = "http://5.35.108.75:3001";

// Стало:
const API_URL = "https://api.terminals.kz";
```

Примеры запросов:

```javascript
// Создание карты HIK
fetch("https://api.terminals.kz/terminals/hik/card", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    /* данные */
  }),
});

// Health check
fetch("https://api.terminals.kz/health");
```

## 🔧 Troubleshooting

### DNS не резолвится

Если `dig +short api.terminals.kz` не возвращает IP:

- Подождите 5-30 минут для распространения DNS
- Проверьте правильность записи в панели DNS
- Очистите DNS кеш: `sudo systemd-resolve --flush-caches` (на Linux)

### Let's Encrypt не выдает сертификат

Ошибки вида "Failed to obtain certificate":

1. Убедитесь что DNS настроен правильно
2. Проверьте что домен доступен извне: `curl http://api.terminals.kz`
3. Посмотрите логи Nginx Proxy Manager

### Не работает проксирование

Если сертификат выдан, но API не отвечает:

1. Проверьте что контейнер `elpass-terminals-api` запущен:
   ```bash
   docker ps | grep elpass-terminals-api
   ```
2. Проверьте что порт 3001 работает локально:
   ```bash
   curl http://localhost:3001/health
   ```
3. В Nginx Proxy Manager попробуйте заменить:
   - `Forward Hostname/IP`: с `elpass-terminals-api` на `localhost`

### CORS ошибки

Если после настройки HTTPS все еще CORS ошибки:

- Убедитесь что фронтенд использует `https://api.terminals.kz`
- Проверьте что бэкенд пересобран с актуальным кодом CORS настроек
- Проверьте Network tab в браузере - должны быть заголовки `Access-Control-Allow-Origin: *`

## 📞 Дополнительная помощь

Проверьте логи:

```bash
# Логи API
docker logs elpass-terminals-api -f

# Логи Nginx Proxy Manager
docker logs nginx-manager -f
```
