import { HikCardService } from "../hik/HikCardService";
import { Card } from "../../models/Card";
import { Terminal } from "../../models/Terminal";
import { PassType } from "../../types/card-upload.types";

describe("HikCardService - buildUserInfo", () => {
  let hikCardService: HikCardService;

  const mockTerminalClient = {
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
  };

  const mockPhotoConverter = {
    fetchPhotoFromUrl: jest.fn(),
    blobToBase64: jest.fn(),
  };

  const mockTerminal: Terminal = {
    id: "terminal-1",
    name: "Test Terminal",
    url: "http://example.com/terminal",
    type: "H",
    host: "test-host",
    meta_: {
      zone: "1",
      username: "admin",
      password: "pass123",
    },
  };

  beforeEach(() => {
    hikCardService = new HikCardService(
      mockTerminalClient as any,
      mockPhotoConverter as any,
      "test-host",
    );
    jest.clearAllMocks();
  });

  describe("userVerifyMode for GUEST passType", () => {
    it("should add userVerifyMode cardOrfaceOrPw for GUEST passType with pin", () => {
      const card: Card = {
        no: "12345678",
        name: "Guest User",
        isBlocked: false,
        meta_: {
          passType: PassType.GUEST,
          pin: "9999",
        },
      };

      // Access private method via reflection
      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.userVerifyMode).toBe("cardOrfaceOrPw");
      expect(userInfo.password).toBe("9999");
    });

    it("should not add userVerifyMode for PERMANENT passType without pin", () => {
      const card: Card = {
        no: "12345678",
        name: "Permanent User",
        isBlocked: false,
        meta_: {
          passType: PassType.PERMANENT,
        },
      };

      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.userVerifyMode).toBeUndefined();
      expect(userInfo.password).toBeUndefined();
    });

    it("should add userVerifyMode for PERMANENT passType with pin", () => {
      const card: Card = {
        no: "12345678",
        name: "Permanent User",
        isBlocked: false,
        meta_: {
          passType: PassType.PERMANENT,
          pin: "1234",
        },
      };

      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.userVerifyMode).toBe("cardOrfaceOrPw");
      expect(userInfo.password).toBe("1234");
    });

    it("should not add userVerifyMode for GUEST without pin", () => {
      const card: Card = {
        no: "12345678",
        name: "Guest User",
        isBlocked: false,
        meta_: {
          passType: PassType.GUEST,
          // no pin - validation is in controller, but here we don't set userVerifyMode
        },
      };

      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.userVerifyMode).toBeUndefined();
      expect(userInfo.password).toBeUndefined();
    });
  });

  describe("userVerifyMode without passType", () => {
    it("should add userVerifyMode when pin is provided without passType", () => {
      const card: Card = {
        no: "12345678",
        name: "User with PIN",
        isBlocked: false,
        meta_: {
          pin: "5555",
        },
      };

      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.userVerifyMode).toBe("cardOrfaceOrPw");
      expect(userInfo.password).toBe("5555");
    });

    it("should not add userVerifyMode when no pin and no passType", () => {
      const card: Card = {
        no: "12345678",
        name: "Simple User",
        isBlocked: false,
        meta_: {},
      };

      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.userVerifyMode).toBeUndefined();
      expect(userInfo.password).toBeUndefined();
    });
  });

  describe("basic userInfo fields", () => {
    it("should set correct employeeNo from card.no", () => {
      const card: Card = {
        no: "12345678",
        name: "Test User",
        isBlocked: false,
        meta_: {},
      };

      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.employeeNo).toBe("12345678");
      expect(userInfo.name).toBe("Test User");
      expect(userInfo.userType).toBe("normal");
    });

    it("should set userType to blackList when isBlocked is true", () => {
      const card: Card = {
        no: "12345678",
        name: "Blocked User",
        isBlocked: true,
        meta_: {
          passType: PassType.BLOCKED,
        },
      };

      const buildUserInfo = (hikCardService as any).buildUserInfo.bind(
        hikCardService,
      );

      const userInfo = buildUserInfo(card, mockTerminal);

      expect(userInfo.userType).toBe("blackList");
    });
  });
});
