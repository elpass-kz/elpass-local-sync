import { Request, Response, NextFunction } from "express";
import { DahuaCardService } from "../services/dahua/DahuaCardService";
import { CardSyncService } from "../services/CardSyncService";
import { ApiError } from "../middleware/errorHandler";
import { Terminal } from "../models/Terminal";
import { decodeCredentials } from "../utils/credentialsEncoder";

export class DahuaController {
  private processingCards: Map<string, Promise<any>> = new Map();

  constructor(
    private dahuaCardService: DahuaCardService,
    private cardSyncService?: CardSyncService,
  ) {}

  private extractTerminal(req: Request): Terminal {
    if (req.body.terminal) {
      return req.body.terminal;
    }

    const xTerminal = req.headers["x-terminal"] as string;
    const xCreds = req.headers["x-creds"] as string;

    if (xTerminal && xCreds) {
      const { username, password } = decodeCredentials(xCreds);

      return {
        url: xTerminal,
        type: "D",
        meta_: {
          username,
          password,
        },
      };
    }

    throw new ApiError(
      400,
      "Terminal is required (either in body or via headers)",
    );
  }

  private extractCard(req: Request): any {
    if (req.body.card) {
      return req.body.card;
    }
    return req.body.data.card;
  }

  async processCard(req: Request, res: Response, next: NextFunction) {
    try {
      const card = this.extractCard(req);
      const lockKey = `dah-${card.no}`;

      // Check if this card is already being processed
      const existingPromise = this.processingCards.get(lockKey);
      if (existingPromise) {
        console.log(
          `DahuaController: Card ${card.no} is already being processed, waiting for result...`,
        );
        const result = await existingPromise;
        return res.status(result.statusCode).json(result.response);
      }

      // Create promise for this processing operation
      const processingPromise = this.doProcessCard(card);
      this.processingCards.set(lockKey, processingPromise);

      try {
        const result = await processingPromise;
        return res.status(result.statusCode).json(result.response);
      } finally {
        // Always cleanup the lock
        this.processingCards.delete(lockKey);
      }
    } catch (error) {
      return next(error);
    }
  }

  private async doProcessCard(
    card: any,
  ): Promise<{ statusCode: number; response: any }> {
    if (!this.cardSyncService) {
      throw new ApiError(500, "CardSyncService is not initialized");
    }

    console.log("DahuaController.processCard: Processing card", {
      no: card.no,
      name: card.name,
      deleted_at: card.deleted_at,
      isOK: card.isOK,
      photo:
        card.photo !== null && card.photo !== undefined ? "present" : "null",
      zones: card.meta_?.zones,
      toProcessZones: card.meta_?.toProcess?.zones,
    });

    // Sync card data first (only to Dahua terminals)
    const cardSyncResult = await this.cardSyncService.syncCard(card, "D");

    // If card has a photo, sync it automatically (only to Dahua terminals)
    let photoSyncResult = null;
    if (card.photo !== null && card.photo !== undefined) {
      console.log("DahuaController.processCard: Auto-syncing photo");
      photoSyncResult = await this.cardSyncService.syncPhoto(
        cardSyncResult.card,
        "D",
      );
    }

    const overallSuccess =
      cardSyncResult.success && (photoSyncResult?.success ?? true);

    const finalCard = photoSyncResult?.card || cardSyncResult.card;

    // Return ONLY the status object directly (no wrapper)
    // This prevents the frontend from saving nested { success: true, status: {...} } structures
    const response: any = {
      card: {
        ver: finalCard.status?.card?.ver || 1,
        ...Object.fromEntries(
          Object.entries(finalCard.status?.card || {}).filter(
            ([key, value]) =>
              key !== "ver" &&
              typeof value === "object" &&
              value !== null &&
              !value.hasOwnProperty("status") &&
              !value.hasOwnProperty("success"),
          ),
        ),
      },
    };

    if (photoSyncResult) {
      response.photo = {
        ver: finalCard.status?.photo?.ver || 1,
        ...Object.fromEntries(
          Object.entries(finalCard.status?.photo || {}).filter(
            ([key, value]) =>
              key !== "ver" &&
              typeof value === "object" &&
              value !== null &&
              !value.hasOwnProperty("status") &&
              !value.hasOwnProperty("success"),
          ),
        ),
      };
    }

    // Return status code and response
    const statusCode = overallSuccess ? 200 : 400;
    return { statusCode, response };
  }

  async batchDeleteCards(req: Request, res: Response, next: NextFunction) {
    try {
      const terminal = this.extractTerminal(req);
      const result = await this.dahuaCardService.batchDeleteCards(terminal);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}
