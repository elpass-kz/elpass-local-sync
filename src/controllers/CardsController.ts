import { Request, Response, NextFunction } from "express";
import pLimit from "p-limit";
import { Card } from "../models/Card";
import { config } from "../config/environment";
import { CardDatabaseService } from "../services/CardDatabaseService";
import { PhotoUploadService } from "../services/PhotoUploadService";
import { CardSyncService } from "../services/CardSyncService";
import { TerminalsService } from "../services/TerminalsService";
import {
  CardUploadRequest,
  CardUploadResponse,
  CardUpdateRequest,
  CardUpdateResponse,
  CardDeleteResponse,
  CardListResponse,
  PassType,
  BatchSyncRequest,
  BatchSyncCardResult,
  BatchSyncResponse,
  RestoreTerminalRequest,
  RestoreTerminalResponse,
} from "../types/card-upload.types";

/**
 * Контроллер для управления карточками (CRUD + синхронизация)
 */
export class CardsController {
  private processingCards: Map<string, Promise<any>> = new Map();
  private readonly BATCH_CONCURRENCY = 5;
  private readonly MAX_BATCH_SIZE = 100;

  /**
   * Генерирует случайный 4-значный пинкод
   */
  private generatePin(): string {
    const pin = Math.floor(1000 + Math.random() * 9000);
    return pin.toString();
  }

  constructor(
    private photoUploadService: PhotoUploadService,
    private cardDatabaseService: CardDatabaseService,
    private cardSyncService: CardSyncService,
    private terminalsService: TerminalsService,
  ) {}

  /**
   * Создает карточку с загрузкой фото и синхронизацией
   * POST /api/cards
   */
  async createCard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      console.log("CardsController: Starting card upload process");

      const {
        name,
        no,
        begin_at,
        end_at,
        passType,
        zones,
        group,
        // Meta fields
        guid,
        type,
        uuid: residentUuid,
        flatno,
        objectGuid,
        objectName,
        entranceNumber,
      } = req.body as CardUploadRequest;

      // Get host from JWT token
      const host = req.user?.host;

      if (!name || !no) {
        res.status(400).json({
          success: false,
          error: "Missing required fields: name, no",
        } as CardUploadResponse);
        return;
      }

      // Generate pin for GUEST passType
      const pin = passType === PassType.GUEST ? this.generatePin() : undefined;

      // Photo is required when passType is not GUEST
      if (passType !== PassType.GUEST && !req.file) {
        res.status(400).json({
          success: false,
          error:
            "Missing required field: photo (required when passType is not GUEST)",
        } as CardUploadResponse);
        return;
      }

      // end_at is required for GUEST passType
      if (passType === PassType.GUEST && !end_at) {
        res.status(400).json({
          success: false,
          error: "Missing required field: end_at (required for GUEST passType)",
        } as CardUploadResponse);
        return;
      }

      // Шаг 1: Загружаем фото на сервер (если предоставлено)
      let photoPath: string | undefined;

      if (req.file) {
        console.log(`CardsController: Uploading photo for card ${no}`);

        const subFolder = this.photoUploadService.determineSubFolder(
          group,
          host,
        );
        const uploadResult = await this.photoUploadService.uploadPhoto(
          req.file,
          subFolder,
          no,
        );

        if (!uploadResult.success) {
          console.error(
            `CardsController: Photo upload failed, aborting card creation`,
          );
          res.status(500).json({
            success: false,
            error: `Failed to upload photo to server: ${uploadResult.error}. Card was not created.`,
          } as CardUploadResponse);
          return;
        }

        photoPath = uploadResult.photoPath;
        console.log(`CardsController: Photo uploaded to ${photoPath}`);
      } else {
        console.log(`CardsController: No photo provided for card ${no}`);
      }

      // Шаг 2: Создаем карточку в БД
      console.log(`CardsController: Creating card in database`);

      // Устанавливаем begin_at и end_at по умолчанию, если не указаны
      const now = new Date();
      const defaultBeginAt = begin_at || now;
      const defaultEndAt =
        end_at ||
        (() => {
          const tenYearsLater = new Date(now);
          tenYearsLater.setFullYear(tenYearsLater.getFullYear() + 10);
          return tenYearsLater;
        })();

      // Determine effective zones:
      // 1. Use zones if provided
      // 2. Otherwise use entranceNumber as zone if provided
      // 3. Default to "all"
      const effectiveZones =
        zones || (entranceNumber ? [entranceNumber] : ["all"]);

      const cardData: Omit<Card, "id" | "uuid" | "created_at" | "updated_at"> =
        {
          name,
          no,
          photo: photoPath,
          isBlocked: passType === PassType.BLOCKED,
          begin_at: defaultBeginAt,
          end_at: defaultEndAt,
          group,
          host,
          meta_: {
            pin,
            passType,
            zones: effectiveZones,
            toProcess: {
              zones: effectiveZones,
            },
            ...(guid && { guid }),
            ...(type && { type }),
            ...(residentUuid && { uuid: residentUuid }),
            ...(flatno && { flatno }),
            ...(objectGuid && { objectGuid }),
            ...(objectName && { objectName }),
            ...(entranceNumber && { entranceNumber }),
          },
          isOK: false, // Изначально false, станет true после успешной синхронизации
        };

      // Get token from request for API calls
      const token = config.elpassToken;

      const createdCard = await this.cardDatabaseService.createCard(
        cardData,
        token,
      );
      console.log(
        `CardsController: Card created with uuid=${createdCard.uuid}`,
      );

      // Шаг 3: Синхронизируем карточку с терминалами
      console.log(`CardsController: Syncing card with terminals`);

      const cardSyncResult = await this.cardSyncService.syncCard(
        createdCard,
        undefined,
        token,
      );

      // Если синхронизация вернула ошибку (например, нет терминалов) - возвращаем её
      if (cardSyncResult.error) {
        res.status(400).json({
          success: false,
          error: cardSyncResult.error,
          uuid: createdCard.uuid,
        } as CardUploadResponse);
        return;
      }

      // Шаг 4: Синхронизируем фото (если есть)
      let photoSyncResult;
      if (photoPath) {
        console.log(`CardsController: Syncing photo with terminals`);
        photoSyncResult = await this.cardSyncService.syncPhoto(
          cardSyncResult.card,
          undefined,
          token,
        );
      }

      const finalCard = photoSyncResult?.card || cardSyncResult.card;

      // Шаг 5: Сохраняем обновленный статус в БД
      if (finalCard.uuid) {
        await this.cardDatabaseService.updateCardByUuid(
          finalCard.uuid,
          {
            status: finalCard.status,
            isOK: finalCard.isOK,
            meta_: finalCard.meta_,
          },
          token,
        );
      }

      // Формируем ответ
      const overallSuccess =
        cardSyncResult.success && (photoSyncResult?.success ?? true);

      const response: CardUploadResponse = {
        success: overallSuccess,
        uuid: finalCard.uuid,
        ...(photoPath && { photoPath }),
        ...(pin && { pin }),
        syncStatus: {
          card: {
            success: cardSyncResult.success,
            operations: cardSyncResult.operations,
          },
          photo: {
            success: photoSyncResult?.success ?? true,
            operations: photoSyncResult?.operations ?? [],
          },
        },
      };

      console.log(
        `CardsController: Card upload process completed with ${overallSuccess ? "success" : "errors"}`,
      );

      res.status(overallSuccess ? 200 : 400).json(response);
    } catch (error: any) {
      console.error("CardsController: Error during card upload", error);

      if (error.isDuplicateKey && error.statusCode === 409) {
        res.status(400).json({
          success: false,
          error: error.message,
        } as CardUploadResponse);
        return;
      }

      next(error);
    }
  }

  /**
   * Обновляет карточку по UUID
   * PATCH /api/cards/:uuid
   */
  async updateCard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { uuid } = req.params;
      const token = config.elpassToken;
      console.log(
        `CardsController: Starting card update process for uuid=${uuid}`,
      );

      // Получаем текущую карточку из БД
      const existingCard = await this.cardDatabaseService.getCardByUuid(
        uuid,
        token,
      );
      if (!existingCard) {
        res.status(404).json({
          success: false,
          error: `Card with uuid=${uuid} not found`,
        } as CardUpdateResponse);
        return;
      }

      if (existingCard.deleted_at) {
        res.status(400).json({
          success: false,
          error: `Card with uuid=${uuid} is deleted`,
        } as CardUpdateResponse);
        return;
      }

      // Извлекаем данные из запроса
      const {
        name,
        no,
        begin_at,
        end_at,
        passType,
        zones,
        group,
        isDisabled,
        // Meta fields
        guid,
        type,
        uuid: residentUuid,
        flatno,
        objectGuid,
        objectName,
        entranceNumber,
      } = req.body as CardUpdateRequest;

      // Get host from JWT token
      const host = req.user?.host;

      // Generate pin if passType is changing to GUEST and card doesn't have one
      const effectivePassType = passType ?? existingCard.meta_?.passType;
      const needsPin =
        effectivePassType === PassType.GUEST && !existingCard.meta_?.pin;
      const generatedPin = needsPin ? this.generatePin() : undefined;

      // Запрещаем изменение номера карточки
      if (no !== undefined && no !== existingCard.no) {
        res.status(400).json({
          success: false,
          error: "Cannot change card number (no). Card number is immutable.",
        } as CardUpdateResponse);
        return;
      }

      let photoPath = existingCard.photo;
      let photoUpdated = false;

      // Если есть новое фото, загружаем его
      if (req.file) {
        console.log(`CardsController: Uploading new photo for card ${uuid}`);

        // Определяем subfolder: если не указан group и host, используем из существующего фото
        let subFolder = this.photoUploadService.determineSubFolder(
          group || existingCard.group,
          host,
        );

        // Если subfolder вернулся как "test" и у карточки есть существующее фото,
        // извлекаем оригинальный subfolder из пути фото
        if (subFolder === "test" && existingCard.photo) {
          const photoPathParts = existingCard.photo.split("/");
          if (photoPathParts.length > 1) {
            subFolder = photoPathParts[0]; // Используем оригинальный subfolder
          }
        }
        const uploadResult = await this.photoUploadService.uploadPhoto(
          req.file,
          subFolder,
          existingCard.no, // Always use existing card number
        );

        if (!uploadResult.success) {
          console.error(
            `CardsController: Photo upload failed, aborting card update`,
          );
          res.status(500).json({
            success: false,
            error: `Failed to upload photo to server: ${uploadResult.error}. Card was not updated.`,
          } as CardUpdateResponse);
          return;
        }

        photoPath = uploadResult.photoPath;
        photoUpdated = true;
        console.log(`CardsController: Photo uploaded to ${photoPath}`);
      }

      // Обновляем карточку в БД
      console.log(`CardsController: Updating card in database`);

      const updateData: Partial<Card> = {
        ...(name !== undefined && { name }),
        // no is immutable - cannot be changed
        ...(begin_at !== undefined && { begin_at }),
        ...(end_at !== undefined && { end_at }),
        ...(passType !== undefined && {
          isBlocked: passType === PassType.BLOCKED,
        }),
        ...(isDisabled !== undefined && { isDisabled }),
        ...(group !== undefined && { group }),
        ...(host !== undefined && { host }),
        ...(photoPath && { photo: photoPath }),
        isOK: false, // Сбрасываем isOK, так как данные изменились
      };

      // Обновляем meta_ если есть изменения
      const hasMetaChanges =
        zones ||
        generatedPin ||
        passType !== undefined ||
        guid ||
        type ||
        residentUuid ||
        flatno ||
        objectGuid ||
        objectName ||
        entranceNumber;

      // Определяем эффективные зоны:
      // 1. Если указаны zones - используем их
      // 2. Если указан entranceNumber (без zones) - используем его как зону
      const effectiveZones =
        zones || (entranceNumber ? [entranceNumber] : null);

      if (hasMetaChanges) {
        updateData.meta_ = {
          ...existingCard.meta_,
          ...(generatedPin && { pin: generatedPin }),
          ...(passType !== undefined && { passType }),
          ...(effectiveZones && {
            zones: effectiveZones,
            toProcess: {
              zones: effectiveZones,
            },
          }),
          ...(guid && { guid }),
          ...(type && { type }),
          ...(residentUuid && { uuid: residentUuid }),
          ...(flatno && { flatno }),
          ...(objectGuid && { objectGuid }),
          ...(objectName && { objectName }),
          ...(entranceNumber && { entranceNumber }),
        };
      }

      const updatedCard = await this.cardDatabaseService.updateCardByUuid(
        uuid,
        updateData,
        token,
      );

      if (!updatedCard) {
        res.status(404).json({
          success: false,
          error: `Failed to update card with uuid=${uuid}`,
        } as CardUpdateResponse);
        return;
      }

      console.log(
        `CardsController: Card updated with uuid=${updatedCard.uuid}`,
      );

      // Обновляем версии timestamp для принудительной синхронизации с терминалами
      if (!updatedCard.status) updatedCard.status = {};
      if (!updatedCard.status.card) updatedCard.status.card = {};
      if (!updatedCard.status.photo) updatedCard.status.photo = {};

      // Устанавливаем версию карточки в текущий timestamp
      updatedCard.status.card.ver = Date.now();

      // Если фото было обновлено ИЛИ зоны изменились (включая entranceNumber), устанавливаем версию фото
      const zonesChanged = !!zones || !!entranceNumber;
      if (photoUpdated || zonesChanged) {
        updatedCard.status.photo.ver = Date.now();
      }

      // Синхронизируем карточку с терминалами
      console.log(`CardsController: Syncing card with terminals`);
      const cardSyncResult = await this.cardSyncService.syncCard(
        updatedCard,
        undefined,
        token,
      );

      // Если синхронизация вернула ошибку (например, нет терминалов) - возвращаем её
      if (cardSyncResult.error) {
        res.status(400).json({
          success: false,
          error: cardSyncResult.error,
          uuid: updatedCard.uuid,
        } as CardUpdateResponse);
        return;
      }

      // Синхронизируем фото если оно было обновлено ИЛИ зоны изменились
      let photoSyncResult;
      if ((photoUpdated || zonesChanged) && updatedCard.photo) {
        console.log(`CardsController: Syncing photo with terminals`);
        photoSyncResult = await this.cardSyncService.syncPhoto(
          cardSyncResult.card,
          undefined,
          token,
        );
      }

      const finalCard = photoSyncResult?.card || cardSyncResult.card;

      // Сохраняем обновленный статус в БД
      if (finalCard.uuid) {
        await this.cardDatabaseService.updateCardByUuid(
          finalCard.uuid,
          {
            status: finalCard.status,
            isOK: finalCard.isOK,
            meta_: finalCard.meta_,
          },
          token,
        );
      }

      // Формируем ответ
      const overallSuccess =
        cardSyncResult.success && (photoSyncResult?.success ?? true);

      const response: CardUpdateResponse = {
        success: overallSuccess,
        uuid: finalCard.uuid,
        ...(photoUpdated && { photoPath }),
        ...(generatedPin && { pin: generatedPin }),
        syncStatus: {
          card: {
            success: cardSyncResult.success,
            operations: cardSyncResult.operations,
          },
          ...(photoSyncResult && {
            photo: {
              success: photoSyncResult.success,
              operations: photoSyncResult.operations,
            },
          }),
        },
      };

      console.log(
        `CardsController: Card update process completed with ${overallSuccess ? "success" : "errors"}`,
      );

      res.status(overallSuccess ? 200 : 400).json(response);
    } catch (error: any) {
      console.error("CardsController: Error during card update", error);
      next(error);
    }
  }

  /**
   * Удаляет карточку по UUID (soft delete)
   * DELETE /api/cards/:uuid
   */
  async deleteCard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { uuid } = req.params;
      const token = config.elpassToken;
      console.log(
        `CardsController: Starting card delete process for uuid=${uuid}`,
      );

      // Получаем текущую карточку из БД
      const existingCard = await this.cardDatabaseService.getCardByUuid(
        uuid,
        token,
      );
      if (!existingCard) {
        res.status(404).json({
          success: false,
          error: `Card with uuid=${uuid} not found`,
        } as CardDeleteResponse);
        return;
      }

      // Удаляем карточку (soft delete)
      console.log(`CardsController: Deleting card from database`);
      const deletedCard = await this.cardDatabaseService.deleteCardByUuid(
        uuid,
        token,
      );

      if (!deletedCard) {
        res.status(404).json({
          success: false,
          error: `Failed to delete card with uuid=${uuid}`,
        } as CardDeleteResponse);
        return;
      }

      console.log(`CardsController: Card deleted with uuid=${uuid}`);

      // Синхронизируем удаление с терминалами
      console.log(`CardsController: Syncing card deletion with terminals`);
      const cardSyncResult = await this.cardSyncService.syncCard(
        deletedCard,
        undefined,
        token,
      );

      // Сохраняем обновленный статус в БД
      if (deletedCard.uuid) {
        await this.cardDatabaseService.updateCardByUuid(
          deletedCard.uuid,
          {
            status: deletedCard.status,
            isOK: deletedCard.isOK,
            meta_: deletedCard.meta_,
          },
          token,
        );
      }

      // Формируем ответ
      const response: CardDeleteResponse = {
        success: cardSyncResult.success,
        uuid: deletedCard.uuid,
        syncStatus: {
          card: {
            success: cardSyncResult.success,
            operations: cardSyncResult.operations,
          },
        },
      };

      console.log(
        `CardsController: Card delete process completed with ${cardSyncResult.success ? "success" : "errors"}`,
      );

      res.status(cardSyncResult.success ? 200 : 400).json(response);
    } catch (error: any) {
      console.error("CardsController: Error during card delete", error);
      next(error);
    }
  }

  /**
   * Получает список карточек с фильтрами
   * GET /api/cards
   */
  async getCards(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = config.elpassToken;
      console.log(`CardsController: Fetching cards with filters`, req.query);

      const { name, group, created_at, page, size, showDeletedCards } =
        req.query;

      const filters = {
        name: name ? String(name) : undefined,
        group: group ? String(group) : undefined,
        created_at: created_at ? String(created_at) : undefined,
        page: page ? parseInt(String(page), 10) : undefined,
        size: size ? parseInt(String(size), 10) : undefined,
        showDeletedCards: showDeletedCards === "true",
      };

      const result = await this.cardDatabaseService.getCards(filters, token);

      const response: CardListResponse = {
        success: true,
        cards: result.cards,
        total: result.total,
      };

      console.log(
        `CardsController: Fetched ${result.cards.length} cards (total: ${result.total})`,
      );

      res.status(200).json(response);
    } catch (error: any) {
      console.error("CardsController: Error fetching cards", error);
      next(error);
    }
  }

  /**
   * Ре-синхронизирует карточку с терминалами
   * POST /api/cards/:uuid/sync
   */
  async syncCard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { uuid } = req.params;
      const token = config.elpassToken;
      const lockKey = `card-${uuid}`;

      console.log(`CardsController: 🔵 NEW SYNC REQUEST for card ${uuid}`);

      // Проверяем, не обрабатывается ли уже эта карточка
      const existingPromise = this.processingCards.get(lockKey);
      if (existingPromise) {
        console.log(
          `CardsController: ⏳ Card ${uuid} is ALREADY being processed, waiting for result...`,
        );
        const result = await existingPromise;
        res.status(result.statusCode).json(result.response);
        return;
      }

      // Создаем promise для этой операции
      console.log(`CardsController: 🔒 Locking card ${uuid} for processing`);
      const processingPromise = this.doSyncCard(uuid, token);
      this.processingCards.set(lockKey, processingPromise);

      try {
        const result = await processingPromise;
        console.log(`CardsController: ✅ Sync completed for card ${uuid}`);
        res.status(result.statusCode).json(result.response);
      } finally {
        // Всегда очищаем lock
        console.log(`CardsController: 🔓 Unlocking card ${uuid}`);
        this.processingCards.delete(lockKey);
      }
    } catch (error: any) {
      console.error("CardsController: Error during card sync", error);
      next(error);
    }
  }

  /**
   * Выполняет синхронизацию карточки
   */
  private async doSyncCard(
    uuid: string,
    token?: string,
  ): Promise<{ statusCode: number; response: any }> {
    // 1. Загружаем карточку из БД по UUID
    const card = await this.cardDatabaseService.getCardByUuid(uuid, token);

    if (!card) {
      return {
        statusCode: 404,
        response: {
          success: false,
          error: `Card with UUID ${uuid} not found`,
        },
      };
    }

    console.log("CardUploadController.syncCard: Processing card", {
      uuid: card.uuid,
      no: card.no,
      name: card.name,
      deleted_at: card.deleted_at,
      isOK: card.isOK,
      photo:
        card.photo !== null && card.photo !== undefined ? "present" : "null",
      zones: card.meta_?.zones,
      toProcessZones: card.meta_?.toProcess?.zones,
    });

    // 2. Если isOK === true, пропускаем синхронизацию
    if (card.isOK === true) {
      console.log(
        "CardUploadController.syncCard: Card isOK=true, skipping sync",
      );
      return {
        statusCode: 200,
        response: {
          success: true,
          status: card.status || {},
          syncStatus: {
            card: { success: true, operations: [], skipped: true },
            photo: { success: true, operations: [], skipped: true },
          },
        },
      };
    }

    // 3. Синхронизируем карточку со всеми терминалами
    const cardSyncResult = await this.cardSyncService.syncCard(
      card,
      undefined,
      token,
    );

    // 4. Если есть фото, синхронизируем фото
    let photoSyncResult = null;
    if (card.photo !== null && card.photo !== undefined) {
      console.log("CardUploadController.syncCard: Auto-syncing photo");
      photoSyncResult = await this.cardSyncService.syncPhoto(
        cardSyncResult.card,
        undefined,
        token,
      );
    }

    const overallSuccess =
      cardSyncResult.success && (photoSyncResult?.success ?? true);

    const finalCard = photoSyncResult?.card || cardSyncResult.card;

    // 5. Сохраняем обновленный статус в БД
    if (finalCard.uuid) {
      try {
        console.log("CardsController: Saving updated status to database");
        await this.cardDatabaseService.updateCardByUuid(
          finalCard.uuid,
          {
            status: finalCard.status,
            isOK: finalCard.isOK,
            meta_: finalCard.meta_,
          },
          token,
        );
        console.log("CardsController: Status saved successfully");
      } catch (error: any) {
        console.error(
          "CardsController: Failed to save status to database:",
          error.message,
        );
        // Не прерываем запрос если обновление БД провалилось
      }
    }

    const cardOperations = cardSyncResult.operations.filter(
      (op) => op.operation !== "skip",
    );
    const photoOperations = (photoSyncResult?.operations ?? []).filter(
      (op) => op.operation !== "skip",
    );

    const response = {
      success: overallSuccess,
      status: finalCard.status || {},
      syncStatus: {
        card: {
          success: cardSyncResult.success,
          operations: cardOperations,
        },
        photo: {
          success: photoSyncResult?.success ?? true,
          operations: photoOperations,
        },
      },
    };

    const statusCode = overallSuccess ? 200 : 400;
    return { statusCode, response };
  }

  /**
   * Batch sync multiple cards with terminals
   * POST /api/cards/sync-batch
   */
  async syncBatch(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { uuids, group_id, objectGuid, guid, zone, deleteZone, begin_at, end_at } =
        req.body as BatchSyncRequest;
      const token = config.elpassToken;

      // Booking mode is enabled when objectGuid is provided
      const isBookingMode = !!objectGuid;

      console.log("CardsController: Starting batch sync", {
        hasUuids: !!uuids,
        hasGroupId: !!group_id,
        hasObjectGuid: !!objectGuid,
        hasGuid: !!guid,
        hasZone: !!zone,
        isBookingMode,
        deleteZone: deleteZone,
      });

      // Booking mode validation (when objectGuid is provided)
      if (isBookingMode) {
        if (!guid) {
          res.status(400).json({
            success: false,
            error: "objectGuid requires guid",
            summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
            results: [],
          } as BatchSyncResponse);
          return;
        }

        if (!zone && !deleteZone) {
          res.status(400).json({
            success: false,
            error:
              "objectGuid requires at least one of: zone (to add) or deleteZone (to remove)",
            summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
            results: [],
          } as BatchSyncResponse);
          return;
        }
      }

      // Count how many filter options are provided
      const filterOptions = [uuids, group_id, objectGuid, guid, zone].filter(
        Boolean,
      );

      // Validation: Must provide at least one filter
      if (filterOptions.length === 0) {
        res.status(400).json({
          success: false,
          error:
            "Must provide at least one filter: uuids, group_id, objectGuid, guid, or zone",
          summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
          results: [],
        } as BatchSyncResponse);
        return;
      }

      // Validate uuids if provided
      if (uuids) {
        if (!Array.isArray(uuids) || uuids.length === 0) {
          res.status(400).json({
            success: false,
            error: "uuids must be a non-empty array of strings",
            summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
            results: [],
          } as BatchSyncResponse);
          return;
        }

        if (uuids.length > this.MAX_BATCH_SIZE) {
          res.status(400).json({
            success: false,
            error: `Maximum batch size is ${this.MAX_BATCH_SIZE} cards`,
            summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
            results: [],
          } as BatchSyncResponse);
          return;
        }

        if (
          !uuids.every((uuid) => typeof uuid === "string" && uuid.length > 0)
        ) {
          res.status(400).json({
            success: false,
            error: "All uuids must be non-empty strings",
            summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
            results: [],
          } as BatchSyncResponse);
          return;
        }
      }

      // Validate string filters
      const stringFilters = { group_id, objectGuid, guid, zone };
      for (const [key, value] of Object.entries(stringFilters)) {
        if (
          value !== undefined &&
          (typeof value !== "string" || value.length === 0)
        ) {
          res.status(400).json({
            success: false,
            error: `${key} must be a non-empty string`,
            summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
            results: [],
          } as BatchSyncResponse);
          return;
        }
      }

      // Fetch cards based on input
      let cards: Card[];
      if (uuids) {
        cards = await this.cardDatabaseService.getCardsByUuids(uuids, token);
      } else if (group_id) {
        cards = await this.cardDatabaseService.getCardsByGroupId(
          group_id,
          token,
        );
      } else {
        // Use meta filters (objectGuid, guid)
        cards = await this.cardDatabaseService.getCardsByMetaFilters(
          {
            objectGuid,
            guid,
          },
          token,
        );
      }

      console.log(`CardsController: Found ${cards.length} cards to sync`);

      if (cards.length === 0) {
        res.status(200).json({
          success: true,
          summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
          results: [],
        } as BatchSyncResponse);
        return;
      }

      // Process cards with concurrency limit
      const limit = pLimit(this.BATCH_CONCURRENCY);
      const results: BatchSyncCardResult[] = [];

      const syncPromises = cards.map((card) =>
        limit(async () => {
          // Override card's begin_at/end_at if provided in request
          if (begin_at !== undefined) card.begin_at = begin_at;
          if (end_at !== undefined) card.end_at = end_at;

          const result = isBookingMode
            ? await this.syncSingleCardBooking(card, zone, deleteZone, token)
            : await this.syncSingleCard(card, token);
          results.push(result);
          return result;
        }),
      );

      await Promise.all(syncPromises);

      // Calculate summary
      const summary = {
        total: cards.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success && r.error !== "skipped")
          .length,
        skipped: results.filter((r) => r.error === "skipped").length,
      };

      const overallSuccess = summary.failed === 0;

      console.log("CardsController: Batch sync completed", summary);

      res.status(200).json({
        success: overallSuccess,
        summary,
        results,
      } as BatchSyncResponse);
    } catch (error: any) {
      console.error("CardsController: Error during batch sync", error);
      next(error);
    }
  }

  /**
   * Sync a single card (helper for batch sync)
   */
  private async syncSingleCard(
    card: Card,
    token?: string,
  ): Promise<BatchSyncCardResult> {
    try {
      // Skip if already synced (isOK === true)
      if (card.isOK === true) {
        console.log(`CardsController: Card ${card.uuid} isOK=true, skipping`);
        return {
          uuid: card.uuid!,
          success: true,
          status: card.status || {},
          error: "skipped",
        };
      }

      // Sync card with terminals
      const cardSyncResult = await this.cardSyncService.syncCard(
        card,
        undefined,
        token,
      );

      // Sync photo if present
      let photoSyncResult = null;
      if (card.photo !== null && card.photo !== undefined) {
        photoSyncResult = await this.cardSyncService.syncPhoto(
          cardSyncResult.card,
          undefined,
          token,
        );
      }

      const overallSuccess =
        cardSyncResult.success && (photoSyncResult?.success ?? true);
      const finalCard = photoSyncResult?.card || cardSyncResult.card;

      // Save updated status to DB
      if (finalCard.uuid) {
        try {
          await this.cardDatabaseService.updateCardByUuid(
            finalCard.uuid,
            {
              status: finalCard.status,
              isOK: finalCard.isOK,
              meta_: finalCard.meta_,
              ...(finalCard.begin_at !== undefined && { begin_at: finalCard.begin_at }),
              ...(finalCard.end_at !== undefined && { end_at: finalCard.end_at }),
            },
            token,
          );
        } catch (dbError: any) {
          console.error(
            `CardsController: Failed to save status for ${finalCard.uuid}:`,
            dbError.message,
          );
        }
      }

      return {
        uuid: card.uuid!,
        success: overallSuccess,
        status: finalCard.status || {},
      };
    } catch (error: any) {
      console.error(
        `CardsController: Failed to sync card ${card.uuid}:`,
        error.message,
      );
      return {
        uuid: card.uuid!,
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }

  /**
   * Sync a single card in booking mode (helper for batch sync)
   * - Skips isOK and deleted_at checks
   * - Only syncs to specified zones
   * - Does not touch cards in other zones
   */
  private async syncSingleCardBooking(
    card: Card,
    zone?: string,
    deleteZone?: string,
    token?: string,
  ): Promise<BatchSyncCardResult> {
    try {
      console.log(
        `CardsController: Booking sync for card ${card.uuid}, zone=${zone}, deleteZone=${deleteZone}`,
      );

      // Sync card with booking mode
      const cardSyncResult = await this.cardSyncService.syncCardBooking(
        card,
        {
          zone,
          deleteZone,
        },
        token,
      );

      // Sync photo with booking mode if card has photo
      let photoSyncResult = null;
      if (
        cardSyncResult.card.photo !== null &&
        cardSyncResult.card.photo !== undefined
      ) {
        console.log(
          `CardsController: Booking sync photo for card ${card.uuid}`,
        );
        photoSyncResult = await this.cardSyncService.syncPhotoBooking(
          cardSyncResult.card,
          {
            zone,
            deleteZone,
          },
          token,
        );
      }

      const overallSuccess =
        cardSyncResult.success && (photoSyncResult?.success ?? true);
      const finalCard = photoSyncResult?.card || cardSyncResult.card;

      // Save updated status to DB
      if (finalCard.uuid) {
        try {
          await this.cardDatabaseService.updateCardByUuid(
            finalCard.uuid,
            {
              status: finalCard.status,
              isOK: finalCard.isOK,
              meta_: finalCard.meta_,
              ...(finalCard.begin_at !== undefined && { begin_at: finalCard.begin_at }),
              ...(finalCard.end_at !== undefined && { end_at: finalCard.end_at }),
            },
            token,
          );
        } catch (dbError: any) {
          console.error(
            `CardsController: Failed to save booking status for ${finalCard.uuid}:`,
            dbError.message,
          );
        }
      }

      return {
        uuid: card.uuid!,
        success: overallSuccess,
        status: finalCard.status || {},
        error: cardSyncResult.error,
      };
    } catch (error: any) {
      console.error(
        `CardsController: Failed to booking sync card ${card.uuid}:`,
        error.message,
      );
      return {
        uuid: card.uuid!,
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }

  /**
   * Восстанавливает данные терминала из БД
   * POST /api/cards/restore-terminal
   *
   * Используется когда терминал был сброшен/очищен и нужно
   * заново загрузить все карточки из БД.
   */
  async restoreTerminal(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { terminalId } = req.body as RestoreTerminalRequest;
      const token = config.elpassToken;

      console.log(
        `CardsController: Starting terminal restore for terminalId=${terminalId}`,
      );

      // Валидация
      if (!terminalId || typeof terminalId !== "string") {
        res.status(400).json({
          success: false,
          error: "terminalId is required and must be a string",
          summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
          results: [],
        } as RestoreTerminalResponse);
        return;
      }

      // Получаем терминал по ID
      const terminal = await this.terminalsService.getTerminalById(
        terminalId,
        token,
      );

      if (!terminal) {
        res.status(404).json({
          success: false,
          error: `Terminal with id=${terminalId} not found`,
          summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
          results: [],
        } as RestoreTerminalResponse);
        return;
      }

      // Проверяем что у терминала есть zone
      if (!terminal.meta_?.zone) {
        res.status(400).json({
          success: false,
          error: "Terminal has no zone in meta_",
          terminal: {
            id: terminal.id!,
            name: terminal.name,
            zone: terminal.meta_?.zone,
          },
          summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
          results: [],
        } as RestoreTerminalResponse);
        return;
      }

      console.log(`CardsController: Restoring terminal`, {
        id: terminal.id,
        name: terminal.name,
        zone: terminal.meta_?.zone,
        objectGuid: terminal.meta_?.objectGuid,
      });

      // Выполняем восстановление
      const result = await this.cardSyncService.restoreTerminal(
        terminal,
        token,
      );

      const response: RestoreTerminalResponse = {
        success: result.success,
        terminal: {
          id: terminal.id!,
          name: terminal.name,
          zone: terminal.meta_?.zone,
        },
        summary: result.summary,
        results: result.results,
        error: result.error,
      };

      console.log(`CardsController: Terminal restore completed`, {
        success: result.success,
        total: result.summary.total,
        succeeded: result.summary.succeeded,
        failed: result.summary.failed,
        skipped: result.summary.skipped,
      });

      res.status(result.success ? 200 : 400).json(response);
    } catch (error: any) {
      console.error("CardsController: Error during terminal restore", error);
      next(error);
    }
  }
}
