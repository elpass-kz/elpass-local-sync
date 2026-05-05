import { Card } from "../models/Card";
import { ApiClient } from "./ApiClient";
import { ENDPOINTS } from "../config/endpoints";

/**
 * Сервис для работы с карточками через API
 * Загружает и обновляет карточки из таблицы el_tcards
 */
export class CardDatabaseService {
  private api: ApiClient;

  constructor(apiClient?: ApiClient) {
    this.api = apiClient || new ApiClient();
  }

  /**
   * Получить карточку по UUID
   */
  async getCardByUuid(uuid: string, token?: string): Promise<Card | null> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      console.log(`CardDatabaseService: Fetching card with uuid=${uuid}`);

      const response = await this.api.get<Card[]>(ENDPOINTS.CARDS, token, {
        uuid: `eq.${uuid}`,
      });

      if (response.data.length === 0) {
        console.warn(`CardDatabaseService: Card with uuid=${uuid} not found`);
        return null;
      }

      const card = response.data[0];
      console.log(`CardDatabaseService: Loaded card`, {
        uuid: card.uuid,
        no: card.no,
        name: card.name,
        isOK: card.isOK,
        deleted_at: card.deleted_at,
      });

      return card;
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to fetch card with uuid=${uuid}`,
        error,
      );
      const wrappedError: any = new Error(`Failed to fetch card: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Обновить карточку по UUID
   */
  async updateCardByUuid(
    uuid: string,
    cardData: Partial<Card>,
    token?: string,
  ): Promise<Card | null> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      const response = await this.api.patch<Card[]>(
        ENDPOINTS.CARDS,
        token,
        cardData,
        { uuid: `eq.${uuid}` },
        { Prefer: "return=representation" },
      );

      if (response.data.length === 0) {
        console.warn(
          `CardDatabaseService: Card with uuid=${uuid} not found or not updated`,
        );
        return null;
      }

      const updatedCard = response.data[0];
      console.log(`CardDatabaseService: Updated card`, {
        uuid: updatedCard.uuid,
        no: updatedCard.no,
        name: updatedCard.name,
        isOK: updatedCard.isOK,
        deleted_at: updatedCard.deleted_at,
      });

      return updatedCard;
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to update card with uuid=${uuid}`,
        error,
      );
      const wrappedError: any = new Error(`Failed to update card: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Создать новую карточку в БД
   */
  async createCard(
    cardData: Omit<Card, "id" | "uuid" | "created_at" | "updated_at">,
    token?: string,
  ): Promise<Card> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      console.log(`CardDatabaseService: Creating new card`, {
        no: cardData.no,
        name: cardData.name,
        group: cardData.group,
      });

      const response = await this.api.post<Card[]>(
        ENDPOINTS.CARDS,
        token,
        cardData,
        { Prefer: "return=representation" },
      );

      if (response.data.length === 0) {
        throw new Error("Failed to create card: no data returned");
      }

      const createdCard = response.data[0];
      console.log(`CardDatabaseService: Created card`, {
        uuid: createdCard.uuid,
        no: createdCard.no,
        name: createdCard.name,
        isOK: createdCard.isOK,
      });

      return createdCard;
    } catch (error: any) {
      console.error(`CardDatabaseService: Failed to create card`, error);

      // Check for duplicate key constraint violation (409 with PostgreSQL code 23505)
      if (
        error.response?.status === 409 &&
        error.response?.data?.code === "23505"
      ) {
        const duplicateError = new Error(
          `Card with number '${cardData.no}' already exists`,
        ) as any;
        duplicateError.isDuplicateKey = true;
        duplicateError.statusCode = 409;
        throw duplicateError;
      }

      const wrappedError: any = new Error(`Failed to create card: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Удалить карточку по UUID (soft delete - устанавливает deleted_at)
   */
  async deleteCardByUuid(uuid: string, token?: string): Promise<Card | null> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      console.log(`CardDatabaseService: Deleting card with uuid=${uuid}`);

      const response = await this.api.patch<Card[]>(
        ENDPOINTS.CARDS,
        token,
        { deleted_at: new Date().toISOString() },
        { uuid: `eq.${uuid}` },
        { Prefer: "return=representation" },
      );

      if (response.data.length === 0) {
        console.warn(
          `CardDatabaseService: Card with uuid=${uuid} not found or not deleted`,
        );
        return null;
      }

      const deletedCard = response.data[0];
      console.log(`CardDatabaseService: Deleted card`, {
        uuid: deletedCard.uuid,
        no: deletedCard.no,
        name: deletedCard.name,
        deleted_at: deletedCard.deleted_at,
      });

      return deletedCard;
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to delete card with uuid=${uuid}`,
        error,
      );
      const wrappedError: any = new Error(`Failed to delete card: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Hard delete — удалить карточку из БД полностью
   */
  async hardDeleteCardByUuid(uuid: string, token?: string): Promise<void> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      console.log(`CardDatabaseService: Hard deleting card with uuid=${uuid}`);

      await this.api.delete(
        ENDPOINTS.CARDS,
        token,
        { uuid: `eq.${uuid}` },
      );

      console.log(`CardDatabaseService: Hard deleted card with uuid=${uuid}`);
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to hard delete card with uuid=${uuid}`,
        error,
      );
      const wrappedError: any = new Error(`Failed to hard delete card: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Получить список карточек с фильтрами
   */
  async getCards(
    filters: {
      name?: string;
      group?: string;
      created_at?: string | Date;
      page?: number;
      size?: number;
      showDeletedCards?: boolean;
    },
    token?: string,
  ): Promise<{ cards: Card[]; total: number }> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      console.log(`CardDatabaseService: Fetching cards with filters`, filters);

      const params: any = {};

      // Фильтр по имени (частичное совпадение)
      if (filters.name) {
        params.name = `ilike.*${filters.name}*`;
      }

      // Фильтр по группе (частичное совпадение)
      if (filters.group) {
        params.group = `ilike.*${filters.group}*`;
      }

      // Фильтр по дате начала (больше или равно)
      if (filters.created_at) {
        params.created_at = `gte.${new Date(filters.created_at).toISOString()}`;
      }

      // Исключаем удаленные карточки по умолчанию
      console.log("showDeletedCards", filters.showDeletedCards);
      if (filters.showDeletedCards) {
        params.deleted_at = "not.is.null";
      }

      if (filters.page && filters.size) {
        params.offset = (filters.page - 1) * filters.size;
        params.limit = filters.size;
      } else if (filters.size) {
        params.limit = filters.size;
      }

      // Сортировка по дате создания (новые карточки первыми)
      params.order = "created_at.desc";

      const response = await this.api.get<Card[]>(
        ENDPOINTS.CARDS,
        token,
        params,
        { Prefer: "count=exact" },
      );

      // Извлекаем общее количество из заголовка Content-Range
      const contentRange = response.headers["content-range"];
      let total = response.data.length;

      if (contentRange) {
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
          total = parseInt(match[1], 10);
        }
      }

      console.log(
        `CardDatabaseService: Loaded ${response.data.length} cards (total: ${total})`,
      );

      return {
        cards: response.data,
        total,
      };
    } catch (error: any) {
      console.error(`CardDatabaseService: Failed to fetch cards`, error);
      const wrappedError: any = new Error(`Failed to fetch cards: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Get cards by group_id using PostgREST array contains syntax
   * Uses: groups=cs.["group_id"]
   * Handles pagination when group has more than 100 cards
   */
  async getCardsByGroupId(groupId: string, token?: string): Promise<Card[]> {
    if (!token) {
      throw new Error("Token is required");
    }

    const PAGE_LIMIT = 100;
    const allCards: Card[] = [];
    let offset = 0;

    try {
      console.log(
        `CardDatabaseService: Fetching cards for group_id=${groupId}`,
      );

      while (true) {
        const response = await this.api.get<Card[]>(ENDPOINTS.CARDS, token, {
          groups: `cs.["${groupId}"]`,
          deleted_at: "is.null",
          limit: PAGE_LIMIT,
          offset,
        });

        allCards.push(...response.data);
        console.log(
          `CardDatabaseService: Fetched ${response.data.length} cards (offset=${offset}, total so far=${allCards.length})`,
        );

        // Если вернулось меньше 100 записей, значит это последняя страница
        if (response.data.length < PAGE_LIMIT) {
          break;
        }

        offset += PAGE_LIMIT;
      }

      console.log(
        `CardDatabaseService: Found ${allCards.length} cards for group_id=${groupId}`,
      );
      return allCards;
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to fetch cards for group_id=${groupId}`,
        error,
      );
      const wrappedError: any = new Error(`Failed to fetch cards by group: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Get cards by meta filters (objectGuid, guid, zone)
   * Uses PostgREST JSON operators for filtering meta_ JSONB column
   */
  async getCardsByMetaFilters(
    filters: {
      objectGuid?: string;
      guid?: string;
      zone?: string;
    },
    token?: string,
  ): Promise<Card[]> {
    if (!token) {
      throw new Error("Token is required");
    }

    const PAGE_LIMIT = 100;
    const allCards: Card[] = [];
    let offset = 0;

    try {
      console.log(
        `CardDatabaseService: Fetching cards by meta filters`,
        filters,
      );

      while (true) {
        const params: any = {
          deleted_at: "is.null",
          limit: PAGE_LIMIT,
          offset,
        };

        // Filter by objectGuid in meta_
        if (filters.objectGuid) {
          params["meta_->>objectGuid"] = `eq.${filters.objectGuid}`;
        }

        // Filter by guid in meta_
        if (filters.guid) {
          params["meta_->>guid"] = `eq.${filters.guid}`;
        }

        // Filter by zone in meta_.zones array
        if (filters.zone) {
          params["meta_->zones"] = `cs.["${filters.zone}"]`;
        }

        const response = await this.api.get<Card[]>(
          ENDPOINTS.CARDS,
          token,
          params,
        );

        allCards.push(...response.data);
        console.log(
          `CardDatabaseService: Fetched ${response.data.length} cards (offset=${offset}, total so far=${allCards.length})`,
        );

        if (response.data.length < PAGE_LIMIT) {
          break;
        }

        offset += PAGE_LIMIT;
      }

      console.log(
        `CardDatabaseService: Found ${allCards.length} cards by meta filters`,
      );
      return allCards;
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to fetch cards by meta filters`,
        error,
      );
      const wrappedError: any = new Error(`Failed to fetch cards by meta filters: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Get multiple cards by UUIDs
   * Uses: uuid=in.(uuid1,uuid2,uuid3)
   * Handles pagination when more than 100 UUIDs are requested
   */
  async getCardsByUuids(uuids: string[], token?: string): Promise<Card[]> {
    if (!token) {
      throw new Error("Token is required");
    }

    const CHUNK_SIZE = 100;
    const allCards: Card[] = [];

    try {
      console.log(
        `CardDatabaseService: Fetching ${uuids.length} cards by UUIDs`,
      );

      // Разбиваем uuids на чанки по 100
      for (let i = 0; i < uuids.length; i += CHUNK_SIZE) {
        const chunk = uuids.slice(i, i + CHUNK_SIZE);

        const response = await this.api.get<Card[]>(ENDPOINTS.CARDS, token, {
          uuid: `in.(${chunk.join(",")})`,
        });

        allCards.push(...response.data);
        console.log(
          `CardDatabaseService: Fetched chunk ${Math.floor(i / CHUNK_SIZE) + 1}, got ${response.data.length} cards (total so far=${allCards.length})`,
        );
      }

      console.log(`CardDatabaseService: Found ${allCards.length} cards`);
      return allCards;
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to fetch cards by UUIDs`,
        error,
      );
      const wrappedError: any = new Error(`Failed to fetch cards by UUIDs: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  /**
   * Get card numbers that should be on a terminal via RPC
   * Uses el_terminals_count RPC function
   */
  async getCardNosForTerminal(
    objectGuid: string,
    entranceNumber: string,
    token?: string,
  ): Promise<string[]> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      console.log(
        `CardDatabaseService: Fetching card nos for objectGuid=${objectGuid}, entrance=${entranceNumber}`,
      );

      const response = await this.api.get<{ data: string[] }>(
        ENDPOINTS.RPC_TERMINALS_COUNT,
        token,
        {
          object_guid: objectGuid,
          entrance_number: entranceNumber,
        },
      );

      const cardNos = response.data?.data || [];
      console.log(
        `CardDatabaseService: RPC returned ${cardNos.length} card numbers`,
      );

      return cardNos;
    } catch (error: any) {
      console.error(
        `CardDatabaseService: Failed to fetch card nos from RPC`,
        error,
      );
      const wrappedError: any = new Error(`Failed to fetch card nos from RPC: ${error.message}`);
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }
}
