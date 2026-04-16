import { Router } from "express";
import multer from "multer";
import { CardsController } from "../controllers/CardsController";
import { ServiceContainer } from "../services/ServiceContainer";
import { jwtAuth } from "../middleware/jwtAuth";

const router = Router();

// Настройка multer для загрузки файлов в память
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB максимальный размер файла
  },
  fileFilter: (_req, file, cb) => {
    // Разрешаем только изображения
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const services = ServiceContainer.getInstance();

const controller = new CardsController(
  services.photoUploadService,
  services.cardDatabaseService,
  services.cardSyncService,
  services.terminalsService,
);

/**
 * GET /api/cards
 * Получает список карточек с фильтрами
 *
 * Query parameters:
 * - name: string (опционально - частичное совпадение)
 * - group: string (опционально - частичное совпадение)
 * - begin_at: string (опционально - начиная с этой даты)
 * - end_at: string (опционально - до этой даты)
 * - limit: number (опционально - лимит результатов)
 * - size: number (опционально - размер страницы для пагинации)
 * - includeDeleted: boolean (опционально - включить удаленные карточки)
 */
router.get("/", jwtAuth, (req, res, next) => {
  controller.getCards(req, res, next);
});

/**
 * POST /api/cards
 * Создает карточку с загрузкой фото и синхронизацией
 *
 * Headers:
 * - Authorization: Bearer <JWT token> (обязательно - host извлекается из токена)
 *
 * Body (multipart/form-data):
 * - name: string (обязательно)
 * - no: string | number (обязательно)
 * - photo: File (обязательно для passType != "guest")
 * - zones: string | string[] (опционально)
 * - begin_at: string | Date (опционально - по умолчанию: текущая дата)
 * - end_at: string | Date (обязательно для passType "guest", опционально для остальных - по умолчанию: +10 лет)
 * - passType: "permanent" | "guest" | "blocked" (опционально)
 * - group: string (опционально - ID группы, используется как subFolder для фото)
 * - meta: JSON string (опционально - complexName, complexId, entrance, apartment, floor)
 *
 * Response:
 * - pin: string (возвращается только для passType "guest" - автоматически сгенерированный 4-значный пинкод)
 */
router.post("/", jwtAuth, upload.single("photo"), (req, res, next) => {
  // Парсим zones если пришло как строка
  if (req.body.zones && typeof req.body.zones === "string") {
    try {
      req.body.zones = JSON.parse(req.body.zones);
    } catch (e) {
      // Если не JSON, оставляем как есть (может быть просто строка "1" или "all")
    }
  }

  // Нормализуем zones в массив строк
  if (req.body.zones !== undefined) {
    const parsed = req.body.zones;
    if (Array.isArray(parsed)) {
      req.body.zones = parsed.map((z: any) => String(z));
    } else {
      req.body.zones = [String(parsed)];
    }
  }

  // Парсим meta если пришло как строка
  if (req.body.meta && typeof req.body.meta === "string") {
    try {
      req.body.meta = JSON.parse(req.body.meta);
    } catch (e) {
      res.status(400).json({
        success: false,
        error: "Invalid meta JSON format",
      });
      return;
    }
  }

  controller.createCard(req, res, next);
});

/**
 * PATCH /api/cards/:uuid
 * Обновляет карточку по UUID
 *
 * Headers:
 * - Authorization: Bearer <JWT token> (обязательно - host извлекается из токена)
 *
 * Body (multipart/form-data):
 * - name: string (опционально)
 * - zones: string | string[] (опционально)
 * - photo: File (опционально - если нужно обновить фото)
 * - begin_at: string | Date (опционально)
 * - end_at: string | Date (опционально)
 * - passType: "permanent" | "guest" | "blocked" (опционально)
 * - group: string (опционально)
 * - meta: JSON string (опционально - complexName, complexId, entrance, apartment, floor)
 * - isDisabled: boolean (опционально - отключить/включить карточку)
 *
 * Note: Card number (no) cannot be changed - it is immutable
 *
 * Response:
 * - pin: string (возвращается если passType изменился на "guest" и карточка ещё не имела пинкод)
 */
router.patch("/:uuid", jwtAuth, upload.single("photo"), (req, res, next) => {
  // Парсим zones если пришло как строка
  if (req.body.zones && typeof req.body.zones === "string") {
    try {
      req.body.zones = JSON.parse(req.body.zones);
    } catch (e) {
      // Если не JSON, оставляем как есть
    }
  }

  // Нормализуем zones в массив строк
  if (req.body.zones !== undefined) {
    const parsed = req.body.zones;
    if (Array.isArray(parsed)) {
      req.body.zones = parsed.map((z: any) => String(z));
    } else {
      req.body.zones = [String(parsed)];
    }
  }

  // Парсим meta если пришло как строка
  if (req.body.meta && typeof req.body.meta === "string") {
    try {
      req.body.meta = JSON.parse(req.body.meta);
    } catch (e) {
      res.status(400).json({
        success: false,
        error: "Invalid meta JSON format",
      });
      return;
    }
  }

  controller.updateCard(req, res, next);
});

/**
 * DELETE /api/cards/:uuid
 * Удаляет карточку по UUID (soft delete)
 *
 * Headers:
 * - Authorization: Bearer <JWT token> (обязательно)
 */
router.delete("/:uuid", jwtAuth, (req, res, next) => {
  controller.deleteCard(req, res, next);
});

/**
 * POST /api/cards/sync-batch
 * Batch sync multiple cards with terminals
 *
 * Body (JSON):
 * Option A - by UUIDs:
 *   { "uuids": ["uuid-1", "uuid-2", ...] }
 *
 * Option B - by group_id:
 *   { "group_id": "group-identifier" }
 *
 * Note: Must provide exactly one option (XOR)
 * Max batch size: 100 cards
 * Concurrency: 5 cards at a time
 */
router.post("/sync-batch", jwtAuth, (req, res, next) => {
  controller.syncBatch(req, res, next);
});

/**
 * POST /api/cards/restore-terminal
 * Восстанавливает данные терминала из БД
 *
 * Используется когда терминал был сброшен/очищен и нужно
 * заново загрузить все карточки из БД.
 *
 * Body (JSON):
 *   { "terminalId": "terminal-uuid" }
 *
 * Response:
 *   {
 *     "success": true,
 *     "terminal": { "id": "...", "name": "...", "zone": "..." },
 *     "summary": { "total": 10, "succeeded": 10, "failed": 0 },
 *     "results": [...]
 *   }
 */
router.post("/restore-terminal", jwtAuth, (req, res, next) => {
  controller.restoreTerminal(req, res, next);
});

/**
 * POST /api/cards/:uuid/sync
 * Ре-синхронизирует карточку с терминалами
 *
 * Используется для повторной синхронизации существующей карточки
 * с терминалами, например после ошибок или обновления данных.
 *
 * Включает lock механизм для предотвращения параллельных запросов.
 */
router.post("/:uuid/sync", jwtAuth, (req, res, next) => {
  controller.syncCard(req, res, next);
});

export default router;
