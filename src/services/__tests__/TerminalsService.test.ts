import axios from "axios";
import { TerminalsService } from "../TerminalsService";
import { Terminal } from "../../models/Terminal";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("TerminalsService", () => {
  let terminalsService: TerminalsService;
  const mockToken = "mock-token";

  const ARENA_PARK_GUID = "9fef18dd-972e-11e9-a82b-00155d101622";
  const ARENA_PARK_NAME = "Arena Park Comfort - 4";
  const DIFFERENT_GUID = "DIFFERENT-GUID";
  const DIFFERENT_NAME = "Different Complex";

  const mockTerminals: Terminal[] = [
    {
      id: "terminal-1",
      name: "Entrance 3",
      url: "http://example.com/terminal1",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "3",
        objectGuid: ARENA_PARK_GUID,
        objectName: ARENA_PARK_NAME,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-2",
      name: "Gate",
      url: "http://example.com/terminal2",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "gate",
        objectGuid: ARENA_PARK_GUID,
        objectName: ARENA_PARK_NAME,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-3",
      name: "Parking",
      url: "http://example.com/terminal3",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "parking",
        objectGuid: ARENA_PARK_GUID,
        objectName: ARENA_PARK_NAME,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-4",
      name: "Different Complex",
      url: "http://example.com/terminal4",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "3",
        objectGuid: DIFFERENT_GUID,
        objectName: DIFFERENT_NAME,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-5",
      name: "Different Host",
      url: "http://example.com/terminal5",
      type: "H",
      host: "astanahub",
      meta_: {
        zone: "3",
        objectGuid: ARENA_PARK_GUID,
        objectName: ARENA_PARK_NAME,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-6",
      name: "Entrance 5",
      url: "http://example.com/terminal6",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "5",
        objectGuid: ARENA_PARK_GUID,
        objectName: ARENA_PARK_NAME,
        username: "admin",
        password: "pass123",
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    terminalsService = new TerminalsService();
  });

  describe("getTerminals", () => {
    it("should throw error when token is not provided", async () => {
      await expect(terminalsService.getTerminals()).rejects.toThrow(
        "Token is required",
      );
    });

    it("should fetch all terminals when no filters provided", async () => {
      mockedAxios.get.mockResolvedValue({ data: mockTerminals });

      const result = await terminalsService.getTerminals(
        undefined,
        undefined,
        undefined,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
          },
        }),
      );
      expect(result).toEqual(mockTerminals);
    });

    it("should filter terminals by host", async () => {
      const bigappTerminals = mockTerminals.filter((t) => t.host === "bigapp");
      mockedAxios.get.mockResolvedValue({ data: bigappTerminals });

      const result = await terminalsService.getTerminals(
        "bigapp",
        undefined,
        undefined,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            host: "eq.bigapp",
          },
        }),
      );
      expect(result).toHaveLength(5); // terminals 1, 2, 3, 4, 6
      expect(result.every((t) => t.host === "bigapp")).toBe(true);
    });

    it("should filter terminals by objectGuid", async () => {
      const objectGuid = ARENA_PARK_GUID;
      const filteredTerminals = mockTerminals.filter(
        (t) => t.meta_?.objectGuid === objectGuid,
      );
      mockedAxios.get.mockResolvedValue({ data: filteredTerminals });

      const result = await terminalsService.getTerminals(
        undefined,
        objectGuid,
        undefined,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            "meta_->>objectGuid": `eq.${objectGuid}`,
          },
        }),
      );
      expect(result).toHaveLength(5); // terminals 1, 2, 3, 5, 6
      expect(result.every((t) => t.meta_?.objectGuid === objectGuid)).toBe(
        true,
      );
    });

    it("should filter terminals by both host and objectGuid", async () => {
      const objectGuid = ARENA_PARK_GUID;
      const filteredTerminals = mockTerminals.filter(
        (t) => t.host === "bigapp" && t.meta_?.objectGuid === objectGuid,
      );
      mockedAxios.get.mockResolvedValue({ data: filteredTerminals });

      const result = await terminalsService.getTerminals(
        "bigapp",
        objectGuid,
        undefined,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            host: "eq.bigapp",
            "meta_->>objectGuid": `eq.${objectGuid}`,
          },
        }),
      );
      expect(result).toHaveLength(4); // terminals 1, 2, 3, 6
      expect(
        result.every(
          (t) => t.host === "bigapp" && t.meta_?.objectGuid === objectGuid,
        ),
      ).toBe(true);
    });

    it("should include authorization header", async () => {
      mockedAxios.get.mockResolvedValue({ data: [] });

      await terminalsService.getTerminals(
        undefined,
        undefined,
        undefined,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: "Bearer mock-token",
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("should throw error when API fails", async () => {
      const errorMessage = "Network error";
      mockedAxios.get.mockRejectedValue(new Error(errorMessage));

      await expect(
        terminalsService.getTerminals(
          undefined,
          undefined,
          undefined,
          mockToken,
        ),
      ).rejects.toThrow(`Failed to fetch terminals: ${errorMessage}`);
    });

    it("should filter terminals by objectGuid and single zone (includes zone, gate, parking)", async () => {
      const objectGuid = ARENA_PARK_GUID;
      const zone = "3";
      const host = "bigapp";
      const filteredTerminals = mockTerminals.filter(
        (t) =>
          t.host === host &&
          t.meta_?.objectGuid === objectGuid &&
          (t.meta_?.zone === zone ||
            t.meta_?.zone === "gate" ||
            t.meta_?.zone === "parking"),
      );
      mockedAxios.get.mockResolvedValue({ data: filteredTerminals });

      const result = await terminalsService.getTerminals(
        host,
        objectGuid,
        zone,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            host: "eq.bigapp",
            and: `(meta_->>objectGuid.eq.${objectGuid},or(meta_->>zone.eq.${zone},meta_->>zone.eq.gate,meta_->>zone.eq.parking))`,
          },
        }),
      );
      expect(result).toHaveLength(3); // terminals 1 (zone 3), 2 (gate), 3 (parking) - all from bigapp host
      expect(result.every((t) => t.meta_?.objectGuid === objectGuid)).toBe(
        true,
      );
    });

    it("should filter terminals by objectGuid and multiple zones as array", async () => {
      const objectGuid = ARENA_PARK_GUID;
      const zones = ["3", "5"];
      const host = "bigapp";
      const filteredTerminals = mockTerminals.filter(
        (t) =>
          t.host === host &&
          t.meta_?.objectGuid === objectGuid &&
          (zones.includes(t.meta_?.zone || "") ||
            t.meta_?.zone === "gate" ||
            t.meta_?.zone === "parking"),
      );
      mockedAxios.get.mockResolvedValue({ data: filteredTerminals });

      const result = await terminalsService.getTerminals(
        host,
        objectGuid,
        zones,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            host: "eq.bigapp",
            and: `(meta_->>objectGuid.eq.${objectGuid},or(meta_->>zone.eq.3,meta_->>zone.eq.5,meta_->>zone.eq.gate,meta_->>zone.eq.parking))`,
          },
        }),
      );
      expect(result).toHaveLength(4); // terminals 1 (zone 3), 2 (gate), 3 (parking), 6 (zone 5) - all from bigapp host
      expect(result.every((t) => t.meta_?.objectGuid === objectGuid)).toBe(
        true,
      );
    });

    it("should filter terminals by objectGuid with 'all' zones (returns all terminals for objectGuid)", async () => {
      const objectGuid = ARENA_PARK_GUID;
      const zones = ["all"];
      const filteredTerminals = mockTerminals.filter(
        (t) => t.meta_?.objectGuid === objectGuid,
      );
      mockedAxios.get.mockResolvedValue({ data: filteredTerminals });

      const result = await terminalsService.getTerminals(
        undefined,
        objectGuid,
        zones,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            "meta_->>objectGuid": `eq.${objectGuid}`,
          },
        }),
      );
      expect(result).toHaveLength(5); // terminals 1, 2, 3, 5, 6
      expect(result.every((t) => t.meta_?.objectGuid === objectGuid)).toBe(
        true,
      );
    });

    it("should filter terminals by host, objectGuid, and zones", async () => {
      const objectGuid = ARENA_PARK_GUID;
      const zones = ["3"];
      const filteredTerminals = mockTerminals.filter(
        (t) =>
          t.host === "bigapp" &&
          t.meta_?.objectGuid === objectGuid &&
          (t.meta_?.zone === "3" ||
            t.meta_?.zone === "gate" ||
            t.meta_?.zone === "parking"),
      );
      mockedAxios.get.mockResolvedValue({ data: filteredTerminals });

      const result = await terminalsService.getTerminals(
        "bigapp",
        objectGuid,
        zones,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            host: "eq.bigapp",
            and: `(meta_->>objectGuid.eq.${objectGuid},or(meta_->>zone.eq.3,meta_->>zone.eq.gate,meta_->>zone.eq.parking))`,
          },
        }),
      );
      expect(result).toHaveLength(3); // terminals 1 (zone 3), 2 (gate), 3 (parking)
      expect(
        result.every(
          (t) => t.host === "bigapp" && t.meta_?.objectGuid === objectGuid,
        ),
      ).toBe(true);
    });

    it("should handle empty zones array (returns all terminals for objectGuid)", async () => {
      const objectGuid = ARENA_PARK_GUID;
      const zones: string[] = [];
      const filteredTerminals = mockTerminals.filter(
        (t) => t.meta_?.objectGuid === objectGuid,
      );
      mockedAxios.get.mockResolvedValue({ data: filteredTerminals });

      const result = await terminalsService.getTerminals(
        undefined,
        objectGuid,
        zones,
        mockToken,
      );

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {
            disabled: "neq.true",
            "meta_->>objectGuid": `eq.${objectGuid}`,
          },
        }),
      );
      expect(result).toHaveLength(5); // terminals 1, 2, 3, 5, 6
      expect(result.every((t) => t.meta_?.objectGuid === objectGuid)).toBe(
        true,
      );
    });
  });
});
