import { TerminalClientService } from "./TerminalClientService";
import { PhotoConverterService } from "./PhotoConverterService";
import { HikCardService } from "./hik/HikCardService";
import { DahuaCardService } from "./dahua/DahuaCardService";
import { TerminalsService } from "./TerminalsService";
import { CardSyncService } from "./CardSyncService";
import { CardDatabaseService } from "./CardDatabaseService";
import { PhotoUploadService } from "./PhotoUploadService";

export class ServiceContainer {
  private static instance: ServiceContainer;

  public readonly terminalClient: TerminalClientService;
  public readonly photoConverter: PhotoConverterService;
  public readonly photoUploadService: PhotoUploadService;
  public readonly terminalsService: TerminalsService;
  public readonly cardDatabaseService: CardDatabaseService;

  public readonly hikCardService: HikCardService;
  public readonly dahuaCardService: DahuaCardService;

  public readonly cardSyncService: CardSyncService;

  private constructor() {
    const host = process.env.HOST;

    this.terminalClient = new TerminalClientService();
    this.photoConverter = new PhotoConverterService();
    this.photoUploadService = new PhotoUploadService();
    this.terminalsService = new TerminalsService();
    this.cardDatabaseService = new CardDatabaseService();

    this.hikCardService = new HikCardService(
      this.terminalClient,
      this.photoConverter,
      host,
    );

    this.dahuaCardService = new DahuaCardService(
      this.terminalClient,
      this.photoConverter,
    );

    this.cardSyncService = new CardSyncService(
      this.hikCardService,
      this.dahuaCardService,
      this.terminalsService,
      this.cardDatabaseService,
    );

    console.log("ServiceContainer: All services initialized");
  }

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  public static reset(): void {
    ServiceContainer.instance = null as any;
  }
}
