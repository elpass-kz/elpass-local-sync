import { Request, Response, NextFunction } from "express";
import { CardsController } from "../CardsController";
import { PassType } from "../../types/card-upload.types";

describe("CardsController - Card Creation Validation", () => {
  let controller: CardsController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const mockPhotoUploadService = {
    determineSubFolder: jest.fn().mockReturnValue("test"),
    uploadPhoto: jest.fn().mockResolvedValue({
      success: true,
      photoPath: "test/photo.jpg",
    }),
  };

  const mockCardDatabaseService = {
    createCard: jest.fn().mockResolvedValue({
      uuid: "test-uuid",
      no: "12345678",
      name: "Test User",
    }),
    updateCardByUuid: jest.fn(),
  };

  const mockCardSyncService = {
    syncCard: jest.fn().mockResolvedValue({
      success: true,
      card: { uuid: "test-uuid" },
      operations: [],
    }),
    syncPhoto: jest.fn().mockResolvedValue({
      success: true,
      card: { uuid: "test-uuid" },
      operations: [],
    }),
  };

  const mockTerminalsService = {
    getTerminalById: jest.fn(),
  };

  beforeEach(() => {
    controller = new CardsController(
      mockPhotoUploadService as any,
      mockCardDatabaseService as any,
      mockCardSyncService as any,
      mockTerminalsService as any,
    );

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = jest.fn();

    mockReq = {
      body: {},
      user: { host: "test-host", exp: 9999999999, iat: 1000000000 },
    };

    jest.clearAllMocks();
  });

  describe("Photo validation", () => {
    it("should allow card creation without photo for GUEST passType", async () => {
      mockReq.body = {
        name: "Test User",
        no: "12345678",
        passType: PassType.GUEST,
        end_at: new Date(Date.now() + 86400000).toISOString(),
      };
      mockReq.file = undefined;

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      // Should not return 400 for missing photo when passType is GUEST
      expect(statusMock).not.toHaveBeenCalledWith(400);
      expect(mockCardDatabaseService.createCard).toHaveBeenCalled();
    });

    it("should require photo when passType is not GUEST", async () => {
      mockReq.body = {
        name: "Test User",
        no: "12345678",
        passType: PassType.PERMANENT,
      };
      mockReq.file = undefined;

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error:
          "Missing required field: photo (required when passType is not GUEST)",
      });
    });

    it("should upload photo when provided", async () => {
      mockReq.body = {
        name: "Test User",
        no: "12345678",
        passType: PassType.PERMANENT,
      };
      mockReq.file = {
        buffer: Buffer.from("fake-image"),
        mimetype: "image/jpeg",
      } as Express.Multer.File;

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockPhotoUploadService.uploadPhoto).toHaveBeenCalled();
    });

    it("should not call syncPhoto when no photo provided", async () => {
      mockReq.body = {
        name: "Test User",
        no: "12345678",
        passType: PassType.GUEST,
        end_at: new Date(Date.now() + 86400000).toISOString(),
      };
      mockReq.file = undefined;

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockCardSyncService.syncPhoto).not.toHaveBeenCalled();
    });
  });

  describe("GUEST passType validation", () => {
    it("should require end_at for GUEST passType", async () => {
      mockReq.body = {
        name: "Guest User",
        no: "87654321",
        passType: PassType.GUEST,
        // no end_at
      };

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        error: "Missing required field: end_at (required for GUEST passType)",
      });
    });

    it("should allow GUEST passType with end_at", async () => {
      mockReq.body = {
        name: "Guest User",
        no: "87654321",
        passType: PassType.GUEST,
        end_at: new Date(Date.now() + 86400000).toISOString(),
      };

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(statusMock).not.toHaveBeenCalledWith(400);
      expect(mockCardDatabaseService.createCard).toHaveBeenCalled();
    });

    it("should not require pin for PERMANENT passType (with photo)", async () => {
      mockReq.body = {
        name: "Permanent User",
        no: "22222222",
        passType: PassType.PERMANENT,
      };
      mockReq.file = {
        buffer: Buffer.from("fake-image"),
        mimetype: "image/jpeg",
      } as Express.Multer.File;

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(statusMock).not.toHaveBeenCalledWith(400);
      expect(mockCardDatabaseService.createCard).toHaveBeenCalled();
    });
  });

  describe("passType stored in meta_", () => {
    it("should store GUEST passType and auto-generated pin in card meta_", async () => {
      mockReq.body = {
        name: "Guest User",
        no: "87654321",
        passType: PassType.GUEST,
        end_at: new Date(Date.now() + 86400000).toISOString(),
      };

      await controller.createCard(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      const createCardCall =
        mockCardDatabaseService.createCard.mock.calls[0][0];
      expect(createCardCall.meta_.passType).toBe(PassType.GUEST);
      // Pin is auto-generated, just check it's a 4-digit string
      expect(createCardCall.meta_.pin).toMatch(/^\d{4}$/);
    });
  });
});
