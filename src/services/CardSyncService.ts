import { Card } from "../models/Card";
import { Terminal } from "../models/Terminal";
import { HikCardService } from "./hik/HikCardService";
import { DahuaCardService } from "./dahua/DahuaCardService";
import { TerminalsService } from "./TerminalsService";
import { CardDatabaseService } from "./CardDatabaseService";
import { OperationResult } from "../types/request.types";

export interface CardOperationResult {
  terminalName: string;
  operation: "create" | "update" | "delete" | "skip";
  success: boolean;
  error?: string;
}

export interface CardSyncResult {
  success: boolean;
  card: Card;
  operations: CardOperationResult[];
  error?: string;
}

export interface PhotoOperationResult {
  terminalName: string;
  operation: "create" | "update" | "delete" | "skip";
  success: boolean;
  error?: string;
}

export interface PhotoSyncResult {
  success: boolean;
  card: Card;
  operations: PhotoOperationResult[];
}

/**
 * Сервис синхронизации карточек с терминалами
 * Портирована логика из frontend processCard (api.js:899-1103)
 */
export class CardSyncService {
  constructor(
    private hikService: HikCardService,
    private dahuaService: DahuaCardService,
    private terminalsService: TerminalsService,
    private cardDatabaseService?: CardDatabaseService,
  ) {}

  async syncCard(
    card: Card,
    filterType?: "H" | "hik" | "D" | "dah",
    token?: string,
  ): Promise<CardSyncResult> {
    this.cleanupNestedStatus(card);

    if (card.status?.card) {
      for (const [key, value] of Object.entries(card.status.card)) {
        if (key !== "ver" && typeof value === "object" && value !== null) {
          const terminalStatus = value as any;
          if (terminalStatus.hasOwnProperty("status")) {
            delete terminalStatus.status;
          }
          if (terminalStatus.hasOwnProperty("success")) {
            delete terminalStatus.success;
          }
        }
      }
    }

    // Получаем ВСЕ терминалы объекта (без фильтрации по зонам)
    // Это нужно чтобы видеть терминалы для удаления при смене зоны
    const objectGuid = card.meta_?.objectGuid;
    let allTerminals = await this.terminalsService.getTerminals(
      objectGuid,
      "all", // Получаем все терминалы объекта
      token,
    );

    // Если терминалы не найдены по objectGuid - возвращаем ошибку
    if (objectGuid && allTerminals.length === 0) {
      return {
        success: false,
        card,
        operations: [],
        error:
          "По данному жилому комплексу терминалы не добавлены, обратитесь к администратору",
      };
    }

    // Фильтруем терминалы по типу если указан
    if (filterType) {
      const normalizedType =
        filterType === "H" || filterType === "hik"
          ? ["H", "hik"]
          : ["D", "dah"];
      allTerminals = allTerminals.filter((t) =>
        normalizedType.includes(t.type),
      );
    }

    // Нормализуем целевые зоны
    const targetZones = this.normalizeZones(
      card.meta_?.toProcess?.zones || card.meta_?.zones,
    );

    const operations: CardOperationResult[] = [];
    let cardIsOK = true;

    // Обрабатываем каждый терминал
    for (const terminal of allTerminals) {
      const terminalZone = terminal.meta_?.zone;

      if (!terminalZone) {
        console.warn(`Terminal ${terminal.id} has no zone, skipping`);
        continue;
      }

      // Определяем какое действие нужно выполнить для карточки
      const operation = this.determineCardAction(
        card,
        [], // previousZones больше не используется, определяем по status
        targetZones,
        terminalZone,
        terminal,
      );

      // Если skip - пропускаем
      if (operation === "skip") {
        operations.push({
          terminalName: terminal.name || terminal.id || "Unknown",
          operation: "skip",
          success: true,
        });
        continue;
      }

      // Выполняем операцию для карточки
      const result = await this.executeCardOperation(card, terminal, operation);

      if (!result.success) {
        cardIsOK = false;
      }

      operations.push({
        terminalName: terminal.name || "Unknown",
        operation,
        success: result.success,
        error: result.error,
      });
    }

    // Обновляем card.meta_.zones = card.meta_.toProcess.zones после успешной синхронизации
    if (cardIsOK) {
      if (!card.meta_) card.meta_ = {};
      card.meta_.zones = targetZones;
      if (!card.meta_.toProcess) {
        card.meta_.toProcess = { zones: targetZones };
      } else {
        card.meta_.toProcess.zones = targetZones;
      }
    }

    card.isOK = cardIsOK;

    // Update top-level version to ensure consistency
    if (!card.status) card.status = {};
    if (!card.status.card) card.status.card = {};
    card.status.card.ver = card.status.card.ver || 1;

    for (const [key, value] of Object.entries(card.status.card)) {
      if (key !== "ver" && typeof value === "object" && value !== null) {
        const terminalStatus = value as any;
        if (terminalStatus.hasOwnProperty("status")) {
          delete terminalStatus.status;
        }
        if (terminalStatus.hasOwnProperty("success")) {
          delete terminalStatus.success;
        }
      }
    }

    return {
      success: cardIsOK,
      card,
      operations,
    };
  }

  async syncPhoto(
    card: Card,
    filterType?: "H" | "hik" | "D" | "dah",
    token?: string,
  ): Promise<PhotoSyncResult> {
    this.cleanupNestedStatus(card);

    if (card.status?.photo) {
      for (const [key, value] of Object.entries(card.status.photo)) {
        if (key !== "ver" && typeof value === "object" && value !== null) {
          const terminalStatus = value as any;
          if (terminalStatus.hasOwnProperty("status")) {
            delete terminalStatus.status;
          }
          if (terminalStatus.hasOwnProperty("success")) {
            delete terminalStatus.success;
          }
        }
      }
    }

    // Получаем ВСЕ терминалы объекта (без фильтрации по зонам)
    // Это нужно чтобы видеть терминалы для удаления при смене зоны
    const objectGuid = card.meta_?.objectGuid;
    let allTerminals = await this.terminalsService.getTerminals(
      objectGuid,
      "all", // Получаем все терминалы объекта
      token,
    );

    // Фильтруем терминалы по типу если указан
    if (filterType) {
      const normalizedType =
        filterType === "H" || filterType === "hik"
          ? ["H", "hik"]
          : ["D", "dah"];
      allTerminals = allTerminals.filter((t) =>
        normalizedType.includes(t.type),
      );
    }

    // Нормализуем целевые зоны
    const targetZones = this.normalizeZones(
      card.meta_?.toProcess?.zones || card.meta_?.zones,
    );

    const operations: PhotoOperationResult[] = [];
    let photoIsOK = true;

    if (!card.status) card.status = {};
    if (!card.status.photo) card.status.photo = {};

    const verPhoto = card.status.photo.ver || 1;

    for (const terminal of allTerminals) {
      const terminalZone = terminal.meta_?.zone;
      const terminalId = terminal.id || "";

      if (!terminalZone) {
        console.warn(`Terminal ${terminal.id} has no zone, skipping`);
        continue;
      }

      const operation = this.determinePhotoAction(
        card,
        [], // previousZones больше не используется, определяем по status
        targetZones,
        terminalZone,
        terminal,
      );

      if (operation === "skip") {
        operations.push({
          terminalName: terminal.name || terminal.id || "Unknown",
          operation: "skip",
          success: true,
        });
        continue;
      }

      // Dahua terminals don't support photo deletion separately - it's handled with card deletion
      const isDahua = terminal.type === "D" || terminal.type === "dah";
      if (isDahua && operation === "delete") {
        operations.push({
          terminalName: terminal.name || terminal.id || "Unknown",
          operation: "skip",
          success: true,
        });
        continue;
      }

      const service = this.getService(terminal);
      let success = true;
      let error: string | undefined;

      try {
        let result: OperationResult;

        switch (operation) {
          case "create":
            result = await service.createPhoto(card, terminal);
            break;
          case "update":
            result = await service.updatePhoto(card, terminal);
            break;
          case "delete":
            // Only HikCardService has deletePhoto (we already filtered out Dahua above)
            result = await this.hikService.deletePhoto(card, terminal);
            break;
        }

        success = result.success || false;
        if (success) {
          // При успешной операции сохраняем только нужные поля ответа терминала
          const terminalData = result.data || {};
          const photoStatus: any = { ver: verPhoto };

          if (
            terminalData.FPID !== undefined &&
            typeof terminalData.FPID !== "object"
          ) {
            photoStatus.FPID = terminalData.FPID;
          }
          if (
            terminalData.statusCode !== undefined &&
            typeof terminalData.statusCode !== "object"
          ) {
            photoStatus.statusCode = terminalData.statusCode;
          }
          if (
            terminalData.statusString !== undefined &&
            typeof terminalData.statusString !== "object"
          ) {
            photoStatus.statusString = terminalData.statusString;
          }
          if (
            terminalData.subStatusCode !== undefined &&
            typeof terminalData.subStatusCode !== "object"
          ) {
            photoStatus.subStatusCode = terminalData.subStatusCode;
          }

          card.status.photo[terminalId] = photoStatus;
        } else {
          error = result.error || "Unknown error";
          const terminalData = result.data || {};
          const existingVer =
            typeof card.status.photo[terminalId] === "object"
              ? (card.status.photo[terminalId] as any)?.ver
              : undefined;

          const photoStatus: any = {
            ver: existingVer || verPhoto,
            error,
          };

          // Explicitly add only allowed fields (excluding status, success, and other nested objects)
          if (
            terminalData.FPID !== undefined &&
            typeof terminalData.FPID !== "object"
          ) {
            photoStatus.FPID = terminalData.FPID;
          }
          if (
            terminalData.statusCode !== undefined &&
            typeof terminalData.statusCode !== "object"
          ) {
            photoStatus.statusCode = terminalData.statusCode;
          }
          if (
            terminalData.statusString !== undefined &&
            typeof terminalData.statusString !== "object"
          ) {
            photoStatus.statusString = terminalData.statusString;
          }
          if (
            terminalData.subStatusCode !== undefined &&
            typeof terminalData.subStatusCode !== "object"
          ) {
            photoStatus.subStatusCode = terminalData.subStatusCode;
          }

          card.status.photo[terminalId] = photoStatus;
        }
      } catch (err: any) {
        success = false;

        let errorText = err.message || String(err);

        if (err.terminalResponse) {
          const responseStr =
            typeof err.terminalResponse === "string"
              ? err.terminalResponse
              : JSON.stringify(err.terminalResponse);
          errorText = responseStr.substring(0, 500);
        } else {
          errorText = errorText.substring(0, 500);
        }

        error = errorText;
        console.error(`Photo ${operation} failed:`, err);

        const terminalData = err.response?.data || {};
        const existingVer =
          typeof card.status.photo[terminalId] === "object"
            ? (card.status.photo[terminalId] as any)?.ver
            : undefined;

        const photoStatus: any = {
          ver: existingVer || verPhoto,
          error: errorText,
        };

        // Explicitly add only allowed fields (excluding status, success, and other nested objects)
        if (
          terminalData.FPID !== undefined &&
          typeof terminalData.FPID !== "object"
        ) {
          photoStatus.FPID = terminalData.FPID;
        }
        if (
          terminalData.statusCode !== undefined &&
          typeof terminalData.statusCode !== "object"
        ) {
          photoStatus.statusCode = terminalData.statusCode;
        }
        if (
          terminalData.statusString !== undefined &&
          typeof terminalData.statusString !== "object"
        ) {
          photoStatus.statusString = terminalData.statusString;
        }
        if (
          terminalData.subStatusCode !== undefined &&
          typeof terminalData.subStatusCode !== "object"
        ) {
          photoStatus.subStatusCode = terminalData.subStatusCode;
        }

        card.status.photo[terminalId] = photoStatus;
      }

      if (!success) {
        photoIsOK = false;
      }

      operations.push({
        terminalName: terminal.name || "Unknown",
        operation,
        success,
        error,
      });
    }

    card.isOK = photoIsOK;

    // Update top-level version to ensure consistency
    if (!card.status) card.status = {};
    if (!card.status.photo) card.status.photo = {};
    card.status.photo.ver = card.status.photo.ver || 1;

    for (const [key, value] of Object.entries(card.status.photo)) {
      if (key !== "ver" && typeof value === "object" && value !== null) {
        const terminalStatus = value as any;
        if (terminalStatus.hasOwnProperty("status")) {
          delete terminalStatus.status;
        }
        if (terminalStatus.hasOwnProperty("success")) {
          delete terminalStatus.success;
        }
      }
    }

    return {
      success: photoIsOK,
      card,
      operations,
    };
  }

  /**
   * Нормализует zones в массив строк
   */
  private normalizeZones(zones: string | string[] | undefined): string[] {
    if (!zones) return [];
    if (typeof zones === "string") return [zones];
    if (Array.isArray(zones)) return zones;
    return [];
  }

  /**
   * Определяет какое действие нужно выполнить для карточки на терминале
   * Использует status.card для определения где карточка уже загружена
   */
  private determineCardAction(
    card: Card,
    _previousZones: string[], // больше не используется, оставлен для совместимости
    targetZones: string[],
    terminalZone: string,
    terminal: Terminal,
  ): "create" | "update" | "delete" | "skip" {
    const verCard = card.status?.card?.ver || 1;
    const cardStatusRaw = card.status?.card?.[terminal.id || ""];
    const cardStatus =
      typeof cardStatusRaw === "object" ? cardStatusRaw : undefined;

    // Карточка загружена на этот терминал если есть ver в status
    const isCardOnTerminal = !!cardStatus?.ver;

    // Если deleted_at IS NOT NULL - удаляем со всех терминалов где карта существует
    if (card.deleted_at) {
      if (isCardOnTerminal) {
        return "delete";
      } else {
        return "skip";
      }
    }

    // Терминал в целевых зонах?
    const isCommonZone = terminalZone === "gate" || terminalZone === "parking";
    const isInTargetZones =
      isCommonZone ||
      targetZones.includes("all") ||
      targetZones.includes(terminalZone);

    if (isInTargetZones) {
      // Терминал должен иметь карточку
      if (!isCardOnTerminal) {
        return "create";
      } else if (cardStatus?.ver != verCard || cardStatus?.error) {
        return "update";
      } else {
        return "skip";
      }
    } else {
      // Терминал НЕ в целевых зонах - если карточка там есть, удаляем
      if (isCardOnTerminal) {
        return "delete";
      } else {
        return "skip";
      }
    }
  }

  /**
   * Выполняет операцию создания/обновления/удаления карточки
   */
  private async executeCardOperation(
    card: Card,
    terminal: Terminal,
    operation: "create" | "update" | "delete" | "skip",
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    const service = this.getService(terminal);
    const terminalId = terminal.id || "";

    // Инициализируем структуру статуса если её нет
    if (!card.status) card.status = {};
    if (!card.status.card) card.status.card = {};

    const verCard = card.status.card.ver || 1;

    try {
      let result: OperationResult | undefined;

      switch (operation) {
        case "create":
          result = await service.createCard(card, terminal);
          break;
        case "update":
          result = await service.updateCard(card, terminal);
          break;
        case "delete":
          result = await service.deleteCard(card, terminal);
          break;
      }

      if (!result) {
        throw new Error(`Unknown operation: ${operation}`);
      }

      const success = result.success || false;
      if (success) {
        // При успешном удалении - удаляем статус терминала
        if (operation === "delete") {
          delete card.status.card[terminalId];
        } else {
          // При успешной операции создания/обновления сохраняем только нужные поля ответа терминала
          const terminalData = result.data || {};
          const terminalStatus: any = { ver: verCard };

          if (
            terminalData.statusCode !== undefined &&
            typeof terminalData.statusCode !== "object"
          ) {
            terminalStatus.statusCode = terminalData.statusCode;
          }
          if (
            terminalData.statusString !== undefined &&
            typeof terminalData.statusString !== "object"
          ) {
            terminalStatus.statusString = terminalData.statusString;
          }
          if (
            terminalData.subStatusCode !== undefined &&
            typeof terminalData.subStatusCode !== "object"
          ) {
            terminalStatus.subStatusCode = terminalData.subStatusCode;
          }
          if (result.recno !== undefined && typeof result.recno !== "object") {
            terminalStatus.recno = result.recno;
          }

          card.status.card[terminalId] = terminalStatus;
        }

        // Если это создание карточки на HikVision терминале - создаем физическую карту
        if (
          operation === "create" &&
          (terminal.type === "H" || terminal.type === "hik") &&
          terminal.meta_?.fizcardCreate === true
        ) {
          try {
            console.log(
              `Creating physical card for terminal ${terminal.name} (${terminalId})`,
            );
            const physicalCardResult = await this.hikService.createPhysicalCard(
              card,
              terminal,
            );
            if (!physicalCardResult.success) {
              console.warn(
                `Physical card creation failed for terminal ${terminal.name}:`,
                physicalCardResult.error,
              );
            }
          } catch (err: any) {
            console.error(
              `Physical card creation error for terminal ${terminal.name}:`,
              err.message,
            );
          }
        }

        return { success: true };
      } else {
        const errorText = result.error || "Unknown error";
        const terminalData = result.data || {};
        const existingVer =
          typeof card.status.card[terminalId] === "object"
            ? (card.status.card[terminalId] as any)?.ver
            : undefined;

        const terminalStatus: any = {
          ver: existingVer || verCard,
          error: errorText,
        };

        if (
          terminalData.statusCode !== undefined &&
          typeof terminalData.statusCode !== "object"
        ) {
          terminalStatus.statusCode = terminalData.statusCode;
        }
        if (
          terminalData.statusString !== undefined &&
          typeof terminalData.statusString !== "object"
        ) {
          terminalStatus.statusString = terminalData.statusString;
        }
        if (
          terminalData.subStatusCode !== undefined &&
          typeof terminalData.subStatusCode !== "object"
        ) {
          terminalStatus.subStatusCode = terminalData.subStatusCode;
        }

        card.status.card[terminalId] = terminalStatus;
        return { success: false, error: errorText };
      }
    } catch (err: any) {
      // Формируем текст ошибки
      let errorText = err.message || String(err);

      // Если есть terminalResponse, добавляем его в ошибку
      if (err.terminalResponse) {
        const responseStr =
          typeof err.terminalResponse === "string"
            ? err.terminalResponse
            : JSON.stringify(err.terminalResponse);
        errorText = responseStr.substring(0, 500);
      } else {
        errorText = errorText.substring(0, 500);
      }

      console.error(`Card ${operation} failed:`, err);

      // Записываем только нужные поля в статус
      const terminalData = err.response?.data || {};
      const existingVer =
        typeof card.status.card[terminalId] === "object"
          ? (card.status.card[terminalId] as any)?.ver
          : undefined;

      const terminalStatus: any = {
        ver: existingVer || verCard,
        error: errorText,
      };

      if (
        terminalData.statusCode !== undefined &&
        typeof terminalData.statusCode !== "object"
      ) {
        terminalStatus.statusCode = terminalData.statusCode;
      }
      if (
        terminalData.statusString !== undefined &&
        typeof terminalData.statusString !== "object"
      ) {
        terminalStatus.statusString = terminalData.statusString;
      }
      if (
        terminalData.subStatusCode !== undefined &&
        typeof terminalData.subStatusCode !== "object"
      ) {
        terminalStatus.subStatusCode = terminalData.subStatusCode;
      }

      card.status.card[terminalId] = terminalStatus;

      return { success: false, error: errorText };
    }
  }

  /**
   * Определяет какое действие нужно выполнить для фото на терминале
   * Использует status.photo для определения где фото уже загружено
   */
  private determinePhotoAction(
    card: Card,
    _previousZones: string[], // больше не используется, оставлен для совместимости
    targetZones: string[],
    terminalZone: string,
    terminal: Terminal,
  ): "create" | "update" | "delete" | "skip" {
    const verPhoto = card.status?.photo?.ver || 1;
    const photoStatusRaw = card.status?.photo?.[terminal.id || ""];
    const photoStatus =
      typeof photoStatusRaw === "object" ? photoStatusRaw : undefined;

    // Фото загружено на этот терминал если есть ver в status
    const isPhotoOnTerminal = !!photoStatus?.ver;

    // Если карточка помечена на удаление - удаляем фото со всех терминалов где оно существует
    if (card.deleted_at) {
      if (isPhotoOnTerminal) {
        return "delete";
      } else {
        return "skip";
      }
    }

    // Если фото отсутствует - пропускаем
    if (card.photo === null || card.photo === undefined) {
      return "skip";
    }

    // Терминал в целевых зонах?
    const isCommonZone = terminalZone === "gate" || terminalZone === "parking";
    const isInTargetZones =
      isCommonZone ||
      targetZones.includes("all") ||
      targetZones.includes(terminalZone);

    if (isInTargetZones) {
      // Терминал должен иметь фото
      if (!isPhotoOnTerminal) {
        return "create";
      } else if (photoStatus?.ver != verPhoto || photoStatus?.error) {
        return "update";
      } else {
        return "skip";
      }
    } else {
      // Терминал НЕ в целевых зонах - если фото там есть, удаляем
      if (isPhotoOnTerminal) {
        return "delete";
      } else {
        return "skip";
      }
    }
  }

  private getService(terminal: Terminal): HikCardService | DahuaCardService {
    if (terminal.type === "H" || terminal.type === "hik") {
      return this.hikService;
    } else {
      return this.dahuaService;
    }
  }

  private cleanupNestedStatus(card: Card): void {
    if (!card.status) return;

    // If card.status has a nested 'status' field, unwrap it
    if (
      (card.status as any).status &&
      typeof (card.status as any).status === "object"
    ) {
      const nestedStatus = (card.status as any).status;

      // Replace the entire status with the nested one
      card.status = {
        card: nestedStatus.card || {},
        photo: nestedStatus.photo || {},
      };
    }

    // Remove 'success' field if it exists at top level
    if ((card.status as any).hasOwnProperty("success")) {
      delete (card.status as any).success;
    }

    // Recursively clean up nested structures in card status
    if (card.status.card && typeof card.status.card === "object") {
      this.cleanupStatusSection(card.status.card);
    }

    // Recursively clean up nested structures in photo status
    if (card.status.photo && typeof card.status.photo === "object") {
      this.cleanupStatusSection(card.status.photo);
    }
  }

  /**
   * Recursively clean up a status section (card or photo)
   */
  private cleanupStatusSection(section: any): void {
    if (!section || typeof section !== "object") return;

    for (const [key, value] of Object.entries(section)) {
      if (key === "ver") continue;

      if (typeof value === "object" && value !== null) {
        // If this terminal status has nested 'status' or 'success', clean it up
        if ((value as any).hasOwnProperty("success")) {
          delete (value as any).success;
        }

        // If there's a nested 'status' object, unwrap it
        if (
          (value as any).status &&
          typeof (value as any).status === "object"
        ) {
          const nestedStatus = (value as any).status;

          // If the nested status has 'card' or 'photo', we need to extract the terminal data
          if (nestedStatus.card && typeof nestedStatus.card === "object") {
            // Find the terminal data within the nested structure
            for (const [nestedKey, nestedValue] of Object.entries(
              nestedStatus.card,
            )) {
              if (nestedKey !== "ver" && typeof nestedValue === "object") {
                // Replace the current value with the unwrapped terminal data
                Object.assign(value as any, nestedValue);
                break;
              }
            }
          }

          // Remove the nested status field
          delete (value as any).status;
        }

        // Recursively clean up deeper levels
        this.cleanupStatusSection(value);
      }
    }
  }

  /**
   * Синхронизация карточки в режиме booking
   * - Пропускает проверки deleted_at, isOK
   * - Работает только с указанными зонами (zone для добавления, deleteZone для удаления)
   * - Не трогает карточки в других зонах
   * - Сохраняет историю в meta_.bookingZones
   */
  async syncCardBooking(
    card: Card,
    options: {
      zone?: string;
      deleteZone?: string;
    },
    token?: string,
  ): Promise<CardSyncResult> {
    this.cleanupNestedStatus(card);

    const objectGuid = card.meta_?.objectGuid;
    if (!objectGuid) {
      return {
        success: false,
        card,
        operations: [],
        error: "Card has no objectGuid in meta_",
      };
    }

    // Получаем все терминалы объекта
    const allTerminals = await this.terminalsService.getTerminals(
      objectGuid,
      "all",
      token,
    );

    if (allTerminals.length === 0) {
      return {
        success: false,
        card,
        operations: [],
        error: "No terminals found for this objectGuid",
      };
    }

    const operations: CardOperationResult[] = [];
    let cardIsOK = true;

    // Инициализируем структуру статуса
    if (!card.status) card.status = {};
    if (!card.status.card) card.status.card = {};
    const verCard = card.status.card.ver || Date.now();
    card.status.card.ver = verCard;

    // Инициализируем zoneHistory в meta_
    if (!card.meta_) card.meta_ = {};
    if (!card.meta_.bookingZones) {
      card.meta_.bookingZones = { added: [], removed: [] };
    }
    if (!card.meta_.zoneHistory) {
      card.meta_.zoneHistory = [];
    }

    // Счётчики реальных операций
    let actualAdds = 0;
    let actualDeletes = 0;
    let actualAddErrors = 0;
    let actualDeleteErrors = 0;

    // Обрабатываем добавление в зону
    if (options.zone) {
      const zoneTerminals = allTerminals.filter(
        (t) => t.meta_?.zone === options.zone,
      );

      for (const terminal of zoneTerminals) {
        const terminalId = terminal.id || "";
        const cardStatusRaw = card.status.card[terminalId];
        const cardStatus =
          typeof cardStatusRaw === "object" ? cardStatusRaw : undefined;
        const isCardOnTerminal = !!cardStatus?.ver;

        // Если карточка уже на терминале - пропускаем
        if (isCardOnTerminal && !cardStatus?.error) {
          operations.push({
            terminalName: terminal.name || "Unknown",
            operation: "skip",
            success: true,
          });
          continue;
        }

        // Создаём или обновляем карточку
        const operation = isCardOnTerminal ? "update" : "create";
        const result = await this.executeCardOperation(
          card,
          terminal,
          operation,
        );

        if (!result.success) {
          cardIsOK = false;
          actualAddErrors++;
        } else {
          actualAdds++;
        }

        operations.push({
          terminalName: terminal.name || "Unknown",
          operation,
          success: result.success,
          error: result.error,
        });
      }

      // Добавляем запись в историю только если была хотя бы одна реальная операция
      if (actualAdds > 0 || actualAddErrors > 0) {
        if (actualAdds > 0) {
          if (!card.meta_.bookingZones.added.includes(options.zone)) {
            card.meta_.bookingZones.added.push(options.zone);
          }
          // Убираем из removed если там была
          card.meta_.bookingZones.removed =
            card.meta_.bookingZones.removed.filter(
              (z: string) => z !== options.zone,
            );
        }
        const now = new Date();
        const dateFormatOptions: Intl.DateTimeFormatOptions = {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour12: false,
          timeZone: "Etc/GMT-5",
        };
        const parts = new Intl.DateTimeFormat(
          "ru-RU",
          dateFormatOptions,
        ).formatToParts(now);
        const hour = parts.find((p) => p.type === "hour")?.value;
        const minute = parts.find((p) => p.type === "minute")?.value;
        const day = parts.find((p) => p.type === "day")?.value;
        const month = parts.find((p) => p.type === "month")?.value;
        const year = parts.find((p) => p.type === "year")?.value;
        const timestamp = `${hour}:${minute} ${day}.${month}.${year}`;
        const action = actualAddErrors > 0 ? "add_error" : "added";
        card.meta_.zoneHistory!.push({
          action,
          zone: options.zone,
          time: timestamp,
        });
        // Ограничиваем историю 20 записями
        if (card.meta_.zoneHistory!.length > 20) {
          card.meta_.zoneHistory = card.meta_.zoneHistory!.slice(-20);
        }
      }
    }

    // Обрабатываем удаление из зоны
    if (options.deleteZone) {
      const deleteZoneTerminals = allTerminals.filter(
        (t) => t.meta_?.zone === options.deleteZone,
      );

      for (const terminal of deleteZoneTerminals) {
        const terminalId = terminal.id || "";
        const cardStatusRaw = card.status.card[terminalId];
        const cardStatus =
          typeof cardStatusRaw === "object" ? cardStatusRaw : undefined;
        const isCardOnTerminal = !!cardStatus?.ver;

        // Если карточки нет на терминале - пропускаем
        if (!isCardOnTerminal) {
          operations.push({
            terminalName: terminal.name || "Unknown",
            operation: "skip",
            success: true,
          });
          continue;
        }

        // Удаляем карточку
        const result = await this.executeCardOperation(
          card,
          terminal,
          "delete",
        );

        if (!result.success) {
          cardIsOK = false;
          actualDeleteErrors++;
        } else {
          actualDeletes++;
        }

        operations.push({
          terminalName: terminal.name || "Unknown",
          operation: "delete",
          success: result.success,
          error: result.error,
        });
      }

      // Добавляем запись в историю только если была хотя бы одна реальная операция удаления
      if (actualDeletes > 0 || actualDeleteErrors > 0) {
        if (actualDeletes > 0) {
          if (!card.meta_.bookingZones.removed.includes(options.deleteZone)) {
            card.meta_.bookingZones.removed.push(options.deleteZone);
          }
          // Убираем из added если там была
          card.meta_.bookingZones.added = card.meta_.bookingZones.added.filter(
            (z: string) => z !== options.deleteZone,
          );
        }
        const now = new Date();
        const dateFormatOptions: Intl.DateTimeFormatOptions = {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour12: false,
          timeZone: "Etc/GMT-5",
        };
        const parts = new Intl.DateTimeFormat(
          "ru-RU",
          dateFormatOptions,
        ).formatToParts(now);
        const hour = parts.find((p) => p.type === "hour")?.value;
        const minute = parts.find((p) => p.type === "minute")?.value;
        const day = parts.find((p) => p.type === "day")?.value;
        const month = parts.find((p) => p.type === "month")?.value;
        const year = parts.find((p) => p.type === "year")?.value;
        const timestamp = `${hour}:${minute} ${day}.${month}.${year}`;
        const action = actualDeleteErrors > 0 ? "remove_error" : "removed";
        card.meta_.zoneHistory!.push({
          action,
          zone: options.deleteZone,
          time: timestamp,
        });

        if (card.meta_.zoneHistory!.length > 10) {
          card.meta_.zoneHistory = card.meta_.zoneHistory!.slice(-20);
        }
      }
    }

    card.isOK = cardIsOK;

    return {
      success: cardIsOK,
      card,
      operations,
    };
  }

  /**
   * Синхронизация фото для режима бронирования
   * Синхронизирует фото только на терминалы указанных зон
   */
  async syncPhotoBooking(
    card: Card,
    options: {
      zone?: string;
      deleteZone?: string;
    },
    token?: string,
  ): Promise<PhotoSyncResult> {
    this.cleanupNestedStatus(card);

    // Пропускаем если нет фото
    if (card.photo === null || card.photo === undefined) {
      console.log("PhotoSyncBooking: No photo on card, skipping");
      return {
        success: true,
        card,
        operations: [],
      };
    }

    const objectGuid = card.meta_?.objectGuid;
    if (!objectGuid) {
      return {
        success: false,
        card,
        operations: [],
      };
    }

    // Получаем все терминалы объекта
    const allTerminals = await this.terminalsService.getTerminals(
      objectGuid,
      "all",
      token,
    );

    if (allTerminals.length === 0) {
      return {
        success: false,
        card,
        operations: [],
      };
    }

    const operations: PhotoOperationResult[] = [];
    let photoIsOK = true;

    // Инициализируем структуру статуса
    if (!card.status) card.status = {};
    if (!card.status.photo) card.status.photo = {};
    const verPhoto = card.status.photo.ver || Date.now();
    card.status.photo.ver = verPhoto;

    // Обрабатываем добавление фото в зону
    if (options.zone) {
      const zoneTerminals = allTerminals.filter(
        (t) => t.meta_?.zone === options.zone,
      );

      for (const terminal of zoneTerminals) {
        const terminalId = terminal.id || "";
        const photoStatusRaw = card.status.photo[terminalId];
        const photoStatus =
          typeof photoStatusRaw === "object" ? photoStatusRaw : undefined;
        const isPhotoOnTerminal = !!photoStatus?.ver;

        // Если фото уже на терминале - пропускаем
        if (isPhotoOnTerminal && !photoStatus?.error) {
          operations.push({
            terminalName: terminal.name || "Unknown",
            operation: "skip",
            success: true,
          });
          continue;
        }

        // Создаём или обновляем фото
        const operation = isPhotoOnTerminal ? "update" : "create";
        const service = this.getService(terminal);

        let success = true;
        let error: string | undefined;

        try {
          let result: OperationResult;

          if (operation === "create") {
            result = await service.createPhoto(card, terminal);
          } else {
            result = await service.updatePhoto(card, terminal);
          }

          success = result.success || false;
          if (success) {
            const terminalData = result.data || {};
            const newPhotoStatus: any = { ver: verPhoto };

            if (
              terminalData.FPID !== undefined &&
              typeof terminalData.FPID !== "object"
            ) {
              newPhotoStatus.FPID = terminalData.FPID;
            }
            if (
              terminalData.statusCode !== undefined &&
              typeof terminalData.statusCode !== "object"
            ) {
              newPhotoStatus.statusCode = terminalData.statusCode;
            }
            if (
              terminalData.statusString !== undefined &&
              typeof terminalData.statusString !== "object"
            ) {
              newPhotoStatus.statusString = terminalData.statusString;
            }
            if (
              terminalData.subStatusCode !== undefined &&
              typeof terminalData.subStatusCode !== "object"
            ) {
              newPhotoStatus.subStatusCode = terminalData.subStatusCode;
            }

            card.status.photo[terminalId] = newPhotoStatus;
          } else {
            error = result.error || "Unknown error";
            photoIsOK = false;
            card.status.photo[terminalId] = {
              ver: verPhoto,
              error: error,
            };
          }
        } catch (err: any) {
          success = false;
          error = err.message || "Unknown error";
          photoIsOK = false;
          card.status.photo[terminalId] = {
            ver: verPhoto,
            error: error,
          };
        }

        operations.push({
          terminalName: terminal.name || "Unknown",
          operation,
          success,
          error,
        });
      }
    }

    // Обрабатываем удаление фото из зоны
    if (options.deleteZone) {
      const deleteZoneTerminals = allTerminals.filter(
        (t) => t.meta_?.zone === options.deleteZone,
      );

      for (const terminal of deleteZoneTerminals) {
        const terminalId = terminal.id || "";
        const photoStatusRaw = card.status.photo[terminalId];
        const photoStatus =
          typeof photoStatusRaw === "object" ? photoStatusRaw : undefined;
        const isPhotoOnTerminal = !!photoStatus?.ver;

        // Если фото нет на терминале - пропускаем
        if (!isPhotoOnTerminal) {
          operations.push({
            terminalName: terminal.name || "Unknown",
            operation: "skip",
            success: true,
          });
          continue;
        }

        // Dahua terminals don't support photo deletion separately
        const isDahua = terminal.type === "D" || terminal.type === "dah";
        if (isDahua) {
          // Remove status for Dahua terminal since card is deleted
          delete card.status.photo[terminalId];
          operations.push({
            terminalName: terminal.name || "Unknown",
            operation: "skip",
            success: true,
          });
          continue;
        }

        // Удаляем фото
        let success = true;
        let error: string | undefined;

        try {
          const result = await this.hikService.deletePhoto(card, terminal);
          success = result.success || false;
          if (success) {
            delete card.status.photo[terminalId];
          } else {
            error = result.error || "Unknown error";
            photoIsOK = false;
          }
        } catch (err: any) {
          success = false;
          error = err.message || "Unknown error";
          photoIsOK = false;
        }

        operations.push({
          terminalName: terminal.name || "Unknown",
          operation: "delete",
          success,
          error,
        });
      }
    }

    return {
      success: photoIsOK,
      card,
      operations,
    };
  }

  /**
   * Восстанавливает данные на терминале из БД
   * Принудительно загружает все карточки, которые должны быть на терминале
   * Игнорирует текущий status - всегда выполняет create
   */
  async restoreTerminal(
    terminal: Terminal,
    token?: string,
  ): Promise<{
    success: boolean;
    summary: {
      total: number;
      succeeded: number;
      failed: number;
      skipped: number;
    };
    results: Array<{
      cardUuid: string;
      cardNo: string;
      cardSuccess: boolean;
      cardError?: string;
      photoSuccess: boolean;
      photoError?: string;
      skipped?: boolean;
    }>;
    error?: string;
  }> {
    if (!this.cardDatabaseService) {
      return {
        success: false,
        summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
        results: [],
        error: "CardDatabaseService not available",
      };
    }

    const terminalZone = terminal.meta_?.zone;
    const objectGuid = terminal.meta_?.objectGuid;

    if (!terminalZone || !objectGuid) {
      return {
        success: false,
        summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
        results: [],
        error: "Terminal has no zone or objectGuid",
      };
    }

    const isHik = terminal.type === "H" || terminal.type === "hik";
    const service = this.getService(terminal);
    const terminalId = terminal.id || "";

    // 1. Получаем список card nos которые должны быть на терминале (RPC)
    const expectedCardNos =
      await this.cardDatabaseService!.getCardNosForTerminal(
        objectGuid,
        terminalZone,
        token,
      );

    if (expectedCardNos.length === 0) {
      return {
        success: true,
        summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
        results: [],
      };
    }

    // 2. Получаем список карточек которые уже есть на терминале
    let existingCardNos: Set<string> = new Set();
    if (isHik) {
      try {
        const existingCards = await this.hikService.getCards(terminal);
        existingCardNos = new Set(
          existingCards.map((c) => String(c.employeeNo)),
        );
      } catch (err: any) {
        // Failed to get existing cards, will create all
      }
    }

    // 3. Вычисляем дельту — карточки которых не хватает на терминале
    const missingCardNos = expectedCardNos.filter(
      (no) => !existingCardNos.has(String(no)),
    );

    console.log(
      `RestoreTerminal: expected=${expectedCardNos.length}, existing=${existingCardNos.size}, missing=${missingCardNos.length}`,
    );

    if (missingCardNos.length === 0) {
      return {
        success: true,
        summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
        results: [],
      };
    }

    // 4. Загружаем данные карточек из БД по номерам
    const allCards = await this.cardDatabaseService!.getCardsByMetaFilters(
      { objectGuid },
      token,
    );
    const missingSet = new Set(missingCardNos.map(String));
    const cardsForTerminal = allCards.filter((card) =>
      missingSet.has(String(card.no)),
    );

    const results: Array<{
      cardUuid: string;
      cardNo: string;
      cardSuccess: boolean;
      cardError?: string;
      photoSuccess: boolean;
      photoError?: string;
      skipped?: boolean;
    }> = [];

    console.log(
      `RestoreTerminal: ${cardsForTerminal.length} cards to sync with terminal ${terminal.name} (${terminalId})`,
    );

    // 5. Загружаем карточки
    for (const card of cardsForTerminal) {
      const cardNoStr = String(card.no);
      let cardSuccess = true;
      let cardError: string | undefined;
      let photoSuccess = true;
      let photoError: string | undefined;
      let skipped = false;

      // Инициализируем status если нужно
      if (!card.status) card.status = {};
      if (!card.status.card) card.status.card = {};
      if (!card.status.photo) card.status.photo = {};

      const verCard = Date.now();
      card.status.card.ver = verCard;

      {
        // Создаём карточку на терминале
        try {
          const cardResult = await service.createCard(card, terminal);

          if (cardResult.success) {
            const terminalData = cardResult.data || {};
            card.status.card[terminalId] = {
              ver: verCard,
              ...(cardResult.recno !== undefined && {
                recno: cardResult.recno,
              }),
              ...(terminalData.statusCode !== undefined && {
                statusCode: terminalData.statusCode,
              }),
            };
          } else {
            // Для Dahua: проверяем если "already exists" — считаем skip
            const errorStr = cardResult.error || "";
            if (
              errorStr.includes("Already Exist") ||
              errorStr.includes("already exist")
            ) {
              skipped = true;
              card.status.card[terminalId] = { ver: verCard };
            } else {
              cardSuccess = false;
              cardError = cardResult.error || "Unknown error";
              card.status.card[terminalId] = { ver: verCard, error: cardError };
            }
          }
        } catch (err: any) {
          const errorStr = err.message || "";
          // Для Dahua: проверяем если "already exists" — считаем skip
          if (
            errorStr.includes("Already Exist") ||
            errorStr.includes("already exist")
          ) {
            skipped = true;
            card.status.card[terminalId] = { ver: verCard };
          } else {
            cardSuccess = false;
            cardError = err.message || "Unknown error";
            card.status.card[terminalId] = { ver: verCard, error: cardError };
          }
        }

        // Создаём фото на терминале (если есть и карточка создана успешно)
        if (card.photo && cardSuccess && !skipped) {
          const verPhoto = Date.now();
          card.status.photo.ver = verPhoto;

          try {
            const photoResult = await service.createPhoto(card, terminal);

            if (photoResult.success) {
              const terminalData = photoResult.data || {};
              card.status.photo[terminalId] = {
                ver: verPhoto,
                ...(terminalData.FPID !== undefined && {
                  FPID: terminalData.FPID,
                }),
                ...(terminalData.statusCode !== undefined && {
                  statusCode: terminalData.statusCode,
                }),
              };
            } else {
              photoSuccess = false;
              photoError = photoResult.error || "Unknown error";
              card.status.photo[terminalId] = {
                ver: verPhoto,
                error: photoError,
              };
            }
          } catch (err: any) {
            photoSuccess = false;
            photoError = err.message || "Unknown error";
            card.status.photo[terminalId] = {
              ver: verPhoto,
              error: photoError,
            };
          }
        }
      }

      // Сохраняем обновлённый status в БД
      try {
        await this.cardDatabaseService.updateCardByUuid(
          card.uuid!,
          { status: card.status },
          token,
        );
      } catch (dbErr: any) {
        // Failed to save status
      }

      results.push({
        cardUuid: card.uuid!,
        cardNo: cardNoStr,
        cardSuccess,
        cardError,
        photoSuccess,
        photoError,
        skipped,
      });
    }

    const skipped = results.filter((r) => r.skipped).length;
    const succeeded = results.filter(
      (r) => r.cardSuccess && r.photoSuccess && !r.skipped,
    ).length;
    const failed = results.filter(
      (r) => !r.cardSuccess || !r.photoSuccess,
    ).length;

    console.log("RestoreTerminal: Restore completed", {
      total: cardsForTerminal.length,
      succeeded,
      failed,
      skipped,
    });

    return {
      success: failed === 0,
      summary: {
        total: cardsForTerminal.length,
        succeeded,
        failed,
        skipped,
      },
      results,
    };
  }
}
