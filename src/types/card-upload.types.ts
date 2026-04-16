export enum PassType {
  PERMANENT = "permanent", // Постоянный
  GUEST = "guest", // Гость
  BLOCKED = "blocked", // Заблокирован
}

export interface CardMeta {
  /** Название ЖК */
  complexName?: string;
  /** ID ЖК */
  complexId?: string;
  /** Подъезд */
  entrance?: string;
  /** Квартира */
  apartment?: string;
  /** Этаж */
  floor?: string;
  /** Любые дополнительные поля */
  [key: string]: any;
}

export interface CardUploadRequest {
  name: string;
  no: string | number;
  photo?: Express.Multer.File;
  begin_at?: string | Date;
  end_at?: string | Date;
  passType?: PassType;
  zones?: string | string[];
  group?: string;
  host?: string;
  pin?: string;
  // Meta fields (will be stored in meta_)
  guid?: string;
  type?: string;
  uuid?: string;
  flatno?: string;
  objectGuid?: string;
  objectName?: string;
  entranceNumber?: string;
}

export interface CardUploadResponse {
  success: boolean;
  uuid?: string;
  card?: any;
  photoPath?: string;
  pin?: string;
  syncStatus?: {
    card: {
      success: boolean;
      operations: any[];
    };
    photo: {
      success: boolean;
      operations: any[];
    };
  };
  error?: string;
}

export interface CardUpdateRequest {
  name?: string;
  no?: string | number;
  photo?: Express.Multer.File;
  begin_at?: string | Date;
  end_at?: string | Date;
  passType?: PassType;
  zones?: string | string[];
  group?: string;
  host?: string;
  pin?: string;
  isDisabled?: boolean;
  // Meta fields (will be stored in meta_)
  guid?: string;
  type?: string;
  uuid?: string;
  flatno?: string;
  objectGuid?: string;
  objectName?: string;
  entranceNumber?: string;
}

/**
 * Ответ на обновление карточки
 */
export interface CardUpdateResponse {
  success: boolean;
  uuid?: string;
  photoPath?: string;
  pin?: string;
  syncStatus?: {
    card: {
      success: boolean;
      operations: any[];
    };
    photo?: {
      success: boolean;
      operations: any[];
    };
  };
  error?: string;
}

/**
 * Ответ на удаление карточки
 */
export interface CardDeleteResponse {
  /** Успешность операции */
  success: boolean;

  /** UUID удаленной карточки */
  uuid?: string;

  /** Статус синхронизации */
  syncStatus?: {
    card: {
      success: boolean;
      operations: any[];
    };
  };

  /** Ошибка */
  error?: string;
}

/**
 * Параметры запроса для получения списка карточек
 */
export interface CardListQuery {
  /** Фильтр по имени (частичное совпадение) */
  name?: string;

  /** Фильтр по группе (частичное совпадение) */
  group?: string;

  /** Фильтр по дате начала (начиная с этой даты) */
  begin_at?: string | Date;

  /** Фильтр по дате окончания (до этой даты) */
  end_at?: string | Date;

  /** Лимит количества результатов */
  limit?: number;

  /** Размер страницы для пагинации */
  size?: number;

  /** Включить удаленные карточки */
  includeDeleted?: boolean;
}

/**
 * Ответ со списком карточек
 */
export interface CardListResponse {
  /** Успешность операции */
  success: boolean;

  /** Список карточек */
  cards?: any[];

  /** Общее количество карточек (для пагинации) */
  total?: number;

  /** Ошибка */
  error?: string;
}

/**
 * Request body for batch sync - must provide exactly one filter option
 */
export interface BatchSyncRequest {
  /** Array of card UUIDs to sync */
  uuids?: string[];
  /** Group ID to filter cards (uses PostgREST array contains) */
  group_id?: string;
  /**
   * Object GUID - enables booking mode when provided
   * Requires: guid and at least one of zone/deleteZone
   */
  objectGuid?: string;
  /** GUID to filter cards (from meta_.guid), required with objectGuid */
  guid?: string;
  /** Zone to ADD card to (booking mode), or filter by zone (normal mode) */
  zone?: string;
  /** Zone to DELETE card from (booking mode only, requires objectGuid) */
  deleteZone?: string;
  /** Start date/time for card validity (overrides card's begin_at during sync) */
  begin_at?: string;
  /** End date/time for card validity (overrides card's end_at during sync) */
  end_at?: string;
}

/**
 * Individual card sync result in batch
 */
export interface BatchSyncCardResult {
  /** UUID of the synced card */
  uuid: string;
  /** Whether sync was successful */
  success: boolean;
  /** Card and photo status after sync */
  status?: {
    card?: any;
    photo?: any;
  };
  /** Error message if sync failed */
  error?: string;
}

/**
 * Response for batch sync endpoint
 */
export interface BatchSyncResponse {
  /** Overall success (true if no failures) */
  success: boolean;
  /** Summary counts */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  /** Individual card results */
  results: BatchSyncCardResult[];
  /** Error message for request-level errors */
  error?: string;
}

/**
 * Request body for restore terminal endpoint
 */
export interface RestoreTerminalRequest {
  /** Terminal ID to restore */
  terminalId: string;
}

/**
 * Individual card restore result
 */
export interface RestoreTerminalCardResult {
  /** UUID of the card */
  cardUuid: string;
  /** Card number */
  cardNo: string;
  /** Whether card creation was successful */
  cardSuccess: boolean;
  /** Error message if card creation failed */
  cardError?: string;
  /** Whether photo creation was successful */
  photoSuccess: boolean;
  /** Error message if photo creation failed */
  photoError?: string;
  /** Whether card was skipped (already exists on terminal) */
  skipped?: boolean;
}

/**
 * Response for restore terminal endpoint
 */
export interface RestoreTerminalResponse {
  /** Overall success (true if no failures) */
  success: boolean;
  /** Terminal info */
  terminal?: {
    id: string;
    name?: string;
    zone?: string;
  };
  /** Summary counts */
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  /** Individual card results */
  results: RestoreTerminalCardResult[];
  /** Error message for request-level errors */
  error?: string;
}
