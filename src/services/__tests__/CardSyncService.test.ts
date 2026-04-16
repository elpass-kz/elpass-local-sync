import { CardSyncService } from "../CardSyncService";
import { Card } from "../../models/Card";
import { Terminal } from "../../models/Terminal";

describe("CardSyncService - Common Zones", () => {
  let cardSyncService: CardSyncService;

  const mockCard: Card = {
    uuid: "card-123",
    no: "12345678",
    name: "John Doe",
    photo: "/uploads/photo.jpg",
    isBlocked: false,
    host: "bigapp",
    meta_: {
      objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
      objectName: "Arena Park Comfort - 4",
      zones: ["3"],
      toProcess: {
        zones: ["3"],
      },
    },
    status: {
      card: {
        ver: 1000,
      },
      photo: {
        ver: 1000,
      },
    },
  };

  const mockTerminals: Terminal[] = [
    {
      id: "terminal-entrance-3",
      name: "Entrance 3",
      url: "http://example.com/terminal1",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "3",
        objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-gate",
      name: "Main Gate",
      url: "http://example.com/gate",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "gate",
        objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-parking",
      name: "Parking",
      url: "http://example.com/parking",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "parking",
        objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-entrance-5",
      name: "Entrance 5",
      url: "http://example.com/terminal5",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "5",
        objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
        username: "admin",
        password: "pass123",
      },
    },
  ];

  beforeEach(() => {
    cardSyncService = new CardSyncService(
      {} as any, // terminalsService
      {} as any, // dahuaCardService
      {} as any, // hikCardService
    );
  });

  describe("determineCardAction - Common Zones", () => {
    it("should create card on gate terminal even if not in zones", () => {
      const card: Card = { ...mockCard };
      const gateTerminal = mockTerminals[1]; // gate terminal

      // Access private method via reflection for testing
      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"], // previousZones
        ["3"], // targetZones
        "gate", // terminalZone
        gateTerminal,
      );

      // Should create because gate is a common zone and card doesn't have status for this terminal
      expect(action).toBe("create");
    });

    it("should create card on parking terminal even if not in zones", () => {
      const card: Card = { ...mockCard };
      const parkingTerminal = mockTerminals[2]; // parking terminal

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"], // previousZones
        ["3"], // targetZones
        "parking", // terminalZone
        parkingTerminal,
      );

      expect(action).toBe("create");
    });

    it("should update card on gate terminal if version differs", () => {
      const card: Card = {
        ...mockCard,
        status: {
          card: {
            ver: 2000,
            "terminal-gate": {
              ver: 1000,
            },
          },
        },
      };
      const gateTerminal = mockTerminals[1];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"],
        ["3"],
        "gate",
        gateTerminal,
      );

      expect(action).toBe("update");
    });

    it("should skip gate terminal if card is up to date", () => {
      const card: Card = {
        ...mockCard,
        status: {
          card: {
            ver: 2000,
            "terminal-gate": {
              ver: 2000,
            },
          },
        },
      };
      const gateTerminal = mockTerminals[1];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"],
        ["3"],
        "gate",
        gateTerminal,
      );

      expect(action).toBe("skip");
    });

    it("should NOT sync to entrance 5 when card has zone 3", () => {
      const card: Card = { ...mockCard };
      const entrance5Terminal = mockTerminals[3];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        [], // previousZones (new card)
        ["3"], // targetZones
        "5", // terminalZone
        entrance5Terminal,
      );

      expect(action).toBe("skip");
    });

    it("should delete card from gate terminal when card is deleted", () => {
      const card: Card = {
        ...mockCard,
        deleted_at: new Date().toISOString(),
        status: {
          card: {
            ver: 1000,
            "terminal-gate": {
              ver: 1000,
            },
          },
        },
      };
      const gateTerminal = mockTerminals[1];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"],
        ["3"],
        "gate",
        gateTerminal,
      );

      expect(action).toBe("delete");
    });
  });

  describe("determineCardAction - zones vs toProcess.zones", () => {
    it("should create card when zone added to toProcess.zones", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3"],
          toProcess: {
            zones: ["3", "5"],
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"], // previousZones (current zones)
        ["3", "5"], // targetZones (toProcess.zones)
        "5", // terminalZone
        entrance5Terminal,
      );

      expect(action).toBe("create");
    });

    it("should delete card when zone removed from toProcess.zones", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3", "5"],
          toProcess: {
            zones: ["3"],
          },
        },
        status: {
          card: {
            ver: 1000,
            "terminal-entrance-5": {
              ver: 1000,
            },
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3", "5"], // previousZones (current zones)
        ["3"], // targetZones (toProcess.zones - removed 5)
        "5", // terminalZone
        entrance5Terminal,
      );

      expect(action).toBe("delete");
    });

    it("should skip when zone not in both zones and toProcess.zones", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3"],
          toProcess: {
            zones: ["3"],
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"], // previousZones
        ["3"], // targetZones
        "5", // terminalZone (not in zones)
        entrance5Terminal,
      );

      expect(action).toBe("skip");
    });

    it("should update when zones equals toProcess.zones but version differs", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3"],
          toProcess: {
            zones: ["3"],
          },
        },
        status: {
          card: {
            ver: 2000,
            "terminal-entrance-3": {
              ver: 1000,
            },
          },
        },
      };
      const entrance3Terminal = mockTerminals[0];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"],
        ["3"],
        "3",
        entrance3Terminal,
      );

      expect(action).toBe("update");
    });

    it("should handle changing from specific zones to all", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3"],
          toProcess: {
            zones: ["all"],
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["3"], // previousZones
        ["all"], // targetZones
        "5", // terminalZone
        entrance5Terminal,
      );

      expect(action).toBe("create");
    });

    it("should handle changing from all to specific zones", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["all"],
          toProcess: {
            zones: ["3"],
          },
        },
        status: {
          card: {
            ver: 1000,
            "terminal-entrance-5": {
              ver: 1000,
            },
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determineCardAction = (
        cardSyncService as any
      ).determineCardAction.bind(cardSyncService);

      const action = determineCardAction(
        card,
        ["all"],
        ["3"],
        "5",
        entrance5Terminal,
      );

      expect(action).toBe("delete");
    });
  });

  describe("determinePhotoAction - Common Zones", () => {
    it("should create photo on gate terminal even if not in zones", () => {
      const card: Card = { ...mockCard };
      const gateTerminal = mockTerminals[1];

      const determinePhotoAction = (
        cardSyncService as any
      ).determinePhotoAction.bind(cardSyncService);

      const action = determinePhotoAction(
        card,
        ["3"], // previousZones
        ["3"], // targetZones
        "gate", // terminalZone
        gateTerminal,
      );

      expect(action).toBe("create");
    });

    it("should create photo on parking terminal even if not in zones", () => {
      const card: Card = { ...mockCard };
      const parkingTerminal = mockTerminals[2];

      const determinePhotoAction = (
        cardSyncService as any
      ).determinePhotoAction.bind(cardSyncService);

      const action = determinePhotoAction(
        card,
        ["3"],
        ["3"],
        "parking",
        parkingTerminal,
      );

      expect(action).toBe("create");
    });

    it("should skip photo sync if photo is null", () => {
      const card: Card = {
        ...mockCard,
        photo: undefined,
      };
      const gateTerminal = mockTerminals[1];

      const determinePhotoAction = (
        cardSyncService as any
      ).determinePhotoAction.bind(cardSyncService);

      const action = determinePhotoAction(
        card,
        ["3"],
        ["3"],
        "gate",
        gateTerminal,
      );

      expect(action).toBe("skip");
    });

    it("should update photo on gate terminal if version differs", () => {
      const card: Card = {
        ...mockCard,
        status: {
          photo: {
            ver: 2000,
            "terminal-gate": {
              ver: 1000,
            },
          },
        },
      };
      const gateTerminal = mockTerminals[1];

      const determinePhotoAction = (
        cardSyncService as any
      ).determinePhotoAction.bind(cardSyncService);

      const action = determinePhotoAction(
        card,
        ["3"],
        ["3"],
        "gate",
        gateTerminal,
      );

      expect(action).toBe("update");
    });
  });

  describe("determinePhotoAction - zones vs toProcess.zones", () => {
    it("should create photo when zone added to toProcess.zones", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3"],
          toProcess: {
            zones: ["3", "5"],
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determinePhotoAction = (
        cardSyncService as any
      ).determinePhotoAction.bind(cardSyncService);

      const action = determinePhotoAction(
        card,
        ["3"],
        ["3", "5"],
        "5",
        entrance5Terminal,
      );

      expect(action).toBe("create");
    });

    it("should delete photo when zone removed from toProcess.zones", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3", "5"],
          toProcess: {
            zones: ["3"],
          },
        },
        status: {
          photo: {
            ver: 1000,
            "terminal-entrance-5": {
              ver: 1000,
            },
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determinePhotoAction = (
        cardSyncService as any
      ).determinePhotoAction.bind(cardSyncService);

      const action = determinePhotoAction(
        card,
        ["3", "5"],
        ["3"],
        "5",
        entrance5Terminal,
      );

      expect(action).toBe("delete");
    });

    it("should handle photo sync when changing from specific zones to all", () => {
      const card: Card = {
        ...mockCard,
        meta_: {
          objectGuid: "9fef18dd-972e-11e9-a82b-00155d101622",
          zones: ["3"],
          toProcess: {
            zones: ["all"],
          },
        },
      };
      const entrance5Terminal = mockTerminals[3];

      const determinePhotoAction = (
        cardSyncService as any
      ).determinePhotoAction.bind(cardSyncService);

      const action = determinePhotoAction(
        card,
        ["3"],
        ["all"],
        "5",
        entrance5Terminal,
      );

      expect(action).toBe("create");
    });
  });
});

describe("CardSyncService - Booking Mode (syncCardBooking)", () => {
  let cardSyncService: CardSyncService;
  let mockHikService: any;
  let mockDahuaService: any;
  let mockTerminalsService: any;

  // 5 people in the same apartment (same objectGuid, guid, and zone "3")
  const apartmentObjectGuid = "apartment-object-guid-123";
  const apartmentGuid = "apartment-guid-456";
  const apartmentZone = "3";

  const createApartmentCard = (index: number): Card => ({
    uuid: `card-resident-${index}`,
    no: `1000000${index}`,
    name: `Resident ${index}`,
    photo: `/uploads/photo${index}.jpg`,
    isBlocked: false,
    host: "bigapp",
    meta_: {
      objectGuid: apartmentObjectGuid,
      objectName: "Arena Park Comfort - 4",
      guid: apartmentGuid,
      zones: [apartmentZone],
      toProcess: {
        zones: [apartmentZone],
      },
    },
    status: {
      card: {
        ver: 1000,
        "terminal-entrance-3": { ver: 1000 },
        "terminal-gate": { ver: 1000 },
        "terminal-parking": { ver: 1000 },
      },
      photo: {
        ver: 1000,
      },
    },
  });

  const mockTerminals: Terminal[] = [
    {
      id: "terminal-entrance-3",
      name: "Entrance 3",
      url: "http://example.com/terminal1",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "3",
        objectGuid: apartmentObjectGuid,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-gate",
      name: "Main Gate",
      url: "http://example.com/gate",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "gate",
        objectGuid: apartmentObjectGuid,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-parking",
      name: "Parking",
      url: "http://example.com/parking",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "parking",
        objectGuid: apartmentObjectGuid,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-gym",
      name: "Gym",
      url: "http://example.com/gym",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "gym",
        objectGuid: apartmentObjectGuid,
        username: "admin",
        password: "pass123",
      },
    },
    {
      id: "terminal-pool",
      name: "Pool",
      url: "http://example.com/pool",
      type: "H",
      host: "bigapp",
      meta_: {
        zone: "pool",
        objectGuid: apartmentObjectGuid,
        username: "admin",
        password: "pass123",
      },
    },
  ];

  beforeEach(() => {
    mockHikService = {
      createCard: jest.fn().mockResolvedValue({ success: true, data: {} }),
      updateCard: jest.fn().mockResolvedValue({ success: true, data: {} }),
      deleteCard: jest.fn().mockResolvedValue({ success: true, data: {} }),
      createPhysicalCard: jest.fn().mockResolvedValue({ success: true }),
    };

    mockDahuaService = {
      createCard: jest.fn().mockResolvedValue({ success: true, data: {} }),
      updateCard: jest.fn().mockResolvedValue({ success: true, data: {} }),
      deleteCard: jest.fn().mockResolvedValue({ success: true, data: {} }),
    };

    mockTerminalsService = {
      getTerminals: jest.fn().mockResolvedValue(mockTerminals),
    };

    cardSyncService = new CardSyncService(
      mockHikService,
      mockDahuaService,
      mockTerminalsService,
    );
  });

  describe("Adding gym zone to 5 apartment residents", () => {
    it("should add gym zone to all 5 residents with same objectGuid/guid/zone", async () => {
      // Arrange: Create fresh 5 cards in the same apartment, none have gym zone yet
      const freshCards = [1, 2, 3, 4, 5].map(createApartmentCard);

      for (const card of freshCards) {
        // Sync each card with zone: "gym"
        const result = await cardSyncService.syncCardBooking(card, {
          zone: "gym",
        });

        // Assert: should succeed and create card on gym terminal
        expect(result.success).toBe(true);
        expect(result.operations).toContainEqual(
          expect.objectContaining({
            terminalName: "Gym",
            operation: "create",
            success: true,
          }),
        );

        // Assert: zoneHistory should contain the added zone
        expect(result.card.meta_?.zoneHistory).toContainEqual(
          expect.objectContaining({ action: "added", zone: "gym" }),
        );
      }

      // Verify createCard was called 5 times (once for each resident on gym terminal)
      expect(mockHikService.createCard).toHaveBeenCalledTimes(5);
    });

    it("should skip gym terminal if card already exists there", async () => {
      // Arrange: Card already has gym in status
      const cardWithGym: Card = {
        ...createApartmentCard(1),
        status: {
          card: {
            ver: 1000,
            "terminal-entrance-3": { ver: 1000 },
            "terminal-gate": { ver: 1000 },
            "terminal-parking": { ver: 1000 },
            "terminal-gym": { ver: 1000 }, // Already on gym terminal
          },
        },
      };

      const result = await cardSyncService.syncCardBooking(cardWithGym, {
        zone: "gym",
      });

      // Assert: should succeed but skip the gym terminal
      expect(result.success).toBe(true);
      expect(result.operations).toContainEqual(
        expect.objectContaining({
          terminalName: "Gym",
          operation: "skip",
          success: true,
        }),
      );

      // createCard should not be called since card already exists
      expect(mockHikService.createCard).not.toHaveBeenCalled();
    });

    it("should update card on gym terminal if it has error", async () => {
      // Arrange: Card has error on gym terminal
      const cardWithError: Card = {
        ...createApartmentCard(1),
        status: {
          card: {
            ver: 1000,
            "terminal-entrance-3": { ver: 1000 },
            "terminal-gym": { ver: 1000, error: "Previous sync failed" },
          },
        },
      };

      const result = await cardSyncService.syncCardBooking(cardWithError, {
        zone: "gym",
      });

      // Assert: should succeed and update card on gym terminal
      expect(result.success).toBe(true);
      expect(result.operations).toContainEqual(
        expect.objectContaining({
          terminalName: "Gym",
          operation: "update",
          success: true,
        }),
      );

      expect(mockHikService.updateCard).toHaveBeenCalledTimes(1);
    });
  });

  describe("Removing gym zone from 5 apartment residents", () => {
    it("should remove gym zone from all 5 residents", async () => {
      // Arrange: 5 cards that have gym zone synced
      const cardsWithGym = [1, 2, 3, 4, 5].map((index) => {
        const card = createApartmentCard(index);
        return {
          ...card,
          meta_: {
            ...card.meta_,
            bookingZones: { added: ["gym"], removed: [] },
          },
          status: {
            card: {
              ver: 1000,
              "terminal-entrance-3": { ver: 1000 },
              "terminal-gate": { ver: 1000 },
              "terminal-parking": { ver: 1000 },
              "terminal-gym": { ver: 1000 }, // Card is on gym terminal
            },
          },
        };
      });

      for (const card of cardsWithGym) {
        // Sync each card with deleteZone: "gym"
        const result = await cardSyncService.syncCardBooking(card, {
          deleteZone: "gym",
        });

        // Assert: should succeed and delete card from gym terminal
        expect(result.success).toBe(true);
        expect(result.operations).toContainEqual(
          expect.objectContaining({
            terminalName: "Gym",
            operation: "delete",
            success: true,
          }),
        );

        // Assert: zoneHistory should contain the removed zone
        expect(result.card.meta_?.zoneHistory).toContainEqual(
          expect.objectContaining({ action: "removed", zone: "gym" }),
        );
      }

      // Verify deleteCard was called 5 times
      expect(mockHikService.deleteCard).toHaveBeenCalledTimes(5);
    });

    it("should skip delete if card is not on gym terminal", async () => {
      // Arrange: Card is not on gym terminal
      const cardWithoutGym: Card = {
        ...createApartmentCard(1),
        status: {
          card: {
            ver: 1000,
            "terminal-entrance-3": { ver: 1000 },
            // No terminal-gym entry
          },
        },
      };

      const result = await cardSyncService.syncCardBooking(cardWithoutGym, {
        deleteZone: "gym",
      });

      // Assert: should succeed but skip the gym terminal
      expect(result.success).toBe(true);
      expect(result.operations).toContainEqual(
        expect.objectContaining({
          terminalName: "Gym",
          operation: "skip",
          success: true,
        }),
      );

      // deleteCard should not be called
      expect(mockHikService.deleteCard).not.toHaveBeenCalled();
    });
  });

  describe("Adding and removing zones in same operation", () => {
    it("should add pool and remove gym in single call", async () => {
      // Arrange: Card has gym zone but not pool
      const cardWithGym: Card = {
        ...createApartmentCard(1),
        meta_: {
          ...createApartmentCard(1).meta_,
          zoneHistory: [{ action: "added", zone: "gym", time: "10:00 01.01.2026" }],
        },
        status: {
          card: {
            ver: 1000,
            "terminal-entrance-3": { ver: 1000 },
            "terminal-gym": { ver: 1000 }, // Has gym
            // No pool
          },
        },
      };

      const result = await cardSyncService.syncCardBooking(cardWithGym, {
        zone: "pool",
        deleteZone: "gym",
      });

      // Assert: should succeed
      expect(result.success).toBe(true);

      // Should create on pool terminal
      expect(result.operations).toContainEqual(
        expect.objectContaining({
          terminalName: "Pool",
          operation: "create",
          success: true,
        }),
      );

      // Should delete from gym terminal
      expect(result.operations).toContainEqual(
        expect.objectContaining({
          terminalName: "Gym",
          operation: "delete",
          success: true,
        }),
      );

      // Assert: zoneHistory should reflect both changes
      expect(result.card.meta_?.zoneHistory).toContainEqual(
        expect.objectContaining({ action: "added", zone: "pool" }),
      );
      expect(result.card.meta_?.zoneHistory).toContainEqual(
        expect.objectContaining({ action: "removed", zone: "gym" }),
      );
    });
  });

  describe("Error handling in booking mode", () => {
    it("should return error if card has no objectGuid", async () => {
      const cardWithoutObjectGuid: Card = {
        ...createApartmentCard(1),
        meta_: {
          zones: ["3"],
          // No objectGuid
        },
      };

      const result = await cardSyncService.syncCardBooking(cardWithoutObjectGuid, {
        zone: "gym",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Card has no objectGuid in meta_");
    });

    it("should return error if no terminals found", async () => {
      mockTerminalsService.getTerminals.mockResolvedValue([]);

      // Use fresh card to avoid state pollution from other tests
      const freshCard = createApartmentCard(1);

      const result = await cardSyncService.syncCardBooking(freshCard, {
        zone: "gym",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No terminals found for this objectGuid");
    });

    it("should handle terminal sync failure gracefully", async () => {
      mockHikService.createCard.mockResolvedValue({
        success: false,
        error: "Terminal connection failed",
      });

      // Use fresh card to avoid state pollution from other tests
      const freshCard = createApartmentCard(1);

      const result = await cardSyncService.syncCardBooking(freshCard, {
        zone: "gym",
      });

      // Assert: overall should fail
      expect(result.success).toBe(false);
      expect(result.operations).toContainEqual(
        expect.objectContaining({
          terminalName: "Gym",
          operation: "create",
          success: false,
          error: "Terminal connection failed",
        }),
      );
    });
  });

  describe("Full scenario: 5 residents, add gym, then remove gym", () => {
    it("should handle complete booking lifecycle for apartment", async () => {
      // Create fresh cards to avoid state pollution from other tests
      const freshCards = [1, 2, 3, 4, 5].map(createApartmentCard);

      // Phase 1: Add gym zone to all 5 residents
      const cardsAfterAdd: Card[] = [];

      for (const card of freshCards) {
        const result = await cardSyncService.syncCardBooking(card, {
          zone: "gym",
        });

        expect(result.success).toBe(true);
        cardsAfterAdd.push(result.card);
      }

      // Verify all 5 cards were added to gym
      expect(mockHikService.createCard).toHaveBeenCalledTimes(5);

      // Phase 2: Remove gym zone from all 5 residents
      jest.clearAllMocks();

      for (const card of cardsAfterAdd) {
        // Update status to simulate gym terminal having the card
        card.status = {
          card: {
            ...card.status?.card,
            "terminal-gym": { ver: 1000 },
          },
        };

        const result = await cardSyncService.syncCardBooking(card, {
          deleteZone: "gym",
        });

        expect(result.success).toBe(true);
        expect(result.card.meta_?.zoneHistory).toContainEqual(
          expect.objectContaining({ action: "removed", zone: "gym" }),
        );
      }

      // Verify all 5 cards were removed from gym
      expect(mockHikService.deleteCard).toHaveBeenCalledTimes(5);
    });
  });
});

