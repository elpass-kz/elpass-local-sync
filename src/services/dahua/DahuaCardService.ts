import { Card, CardStatus } from "../../models/Card";
import { Terminal } from "../../models/Terminal";
import { OperationResult } from "../../types/request.types";
import {
  DahuaUserInfo,
  DahuaUpdateUserInfo,
  DahuaPhotoData,
  DahuaDeleteCard,
  DahuaFaceToken,
  DahuaFaceDataRequest,
} from "../../types/dahua.types";
import { TerminalClientService } from "../TerminalClientService";
import {
  formatDate,
  formatDateForDahua,
  getTodayMidnight,
} from "../../utils/dateFormatter";
import { formatCredentials } from "../../utils/credentialsEncoder";
import { PhotoConverterService } from "../PhotoConverterService";

export class DahuaCardService {
  constructor(
    private terminalClient: TerminalClientService,
    private photoConverter: PhotoConverterService,
  ) {}

  private getCredentials(terminal: Terminal): string {
    const username = terminal.meta_?.username;
    const password = terminal.meta_?.password;

    if (!username || !password) {
      throw new Error("Terminal credentials (username/password) are required");
    }

    return formatCredentials(username, password);
  }

  async createCard(
    card: Card,
    terminal: Terminal,
    cardStatus?: CardStatus,
    triedFallback: boolean = false,
  ): Promise<OperationResult> {
    console.log("DAH createCard triggered");

    const UserInfo: DahuaUserInfo = {
      CardName: card.name,
      CardNo: card.no.toString(),
      UserID: card.no.toString(),
      CardStatus: card.isBlocked ? 1 : 0,
    };

    if (card.meta_?.pin) {
      UserInfo.Password = card.meta_.pin;
    }

    const start = card.begin_at ? new Date(card.begin_at) : getTodayMidnight();
    const endBase = card.end_at ? new Date(card.end_at) : getTodayMidnight();

    if (!card.end_at) {
      endBase.setFullYear(endBase.getFullYear() + 10);
    }

    UserInfo.ValidDateStart = formatDate(start);
    UserInfo.ValidDateEnd = formatDate(endBase);

    const base64Creds = this.getCredentials(terminal);

    try {
      const response = await this.terminalClient.post(
        "",
        UserInfo,
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "dah",
          "X-Module": "card",
        },
        terminal,
        base64Creds,
      );

      // Extract RecNo from response like "RecNo=123"
      const recnoMatch = response.match(/RecNo=(\d+)/);
      const recno = recnoMatch ? recnoMatch[1] : null;

      return { success: true, data: response, recno };
    } catch (err: any) {
      console.log(
        "createCardErrorDah",
        err.response?.data || err.terminalResponse || err.message,
      );

      // Check if card already exists - fallback to update
      const errorData = err.response?.data || err.terminalResponse;
      const statusString =
        typeof errorData === "object" ? errorData?.statusString : errorData;
      const subStatusCode =
        typeof errorData === "object" ? errorData?.subStatusCode : null;

      if (
        !triedFallback &&
        (statusString?.includes("Bad Request") ||
          subStatusCode === "cardAlreadyExists")
      ) {
        console.log("Fallback: trying updateCard after createCard failed");
        return this.updateCard(card, terminal, cardStatus, true);
      }
      throw err;
    }
  }

  async updateCard(
    card: Card,
    terminal: Terminal,
    cardStatus?: CardStatus,
    triedFallback: boolean = false,
  ): Promise<OperationResult> {
    console.debug("-----updateCard DAH", "card status", card.status);
    let recno: string | null = cardStatus?.recno?.toString() || null;

    if (!recno) {
      recno = await this.getRecordByUserID(card, terminal);
    }

    const start = card.begin_at ? new Date(card.begin_at) : getTodayMidnight();
    const endBase = card.end_at ? new Date(card.end_at) : getTodayMidnight();

    if (!card.end_at) {
      endBase.setFullYear(endBase.getFullYear() + 10);
    }

    if (!recno) {
      if (!triedFallback) {
        console.log("RecNo not found, fallback to createCard");
        return this.createCard(card, terminal, cardStatus, true);
      }
      throw new Error("RecNo not found, cannot update card");
    }

    const UserInfo: DahuaUpdateUserInfo = {
      recno: recno,
      CardName: card.name,
      CardStatus: card.isBlocked ? 1 : 0,
      ValidDateStart: formatDateForDahua(start),
      ValidDateEnd: formatDateForDahua(endBase),
    };

    if (card.meta_?.pin) {
      UserInfo.Password = card.meta_.pin;
    }

    const base64Creds = this.getCredentials(terminal);

    try {
      const response = await this.terminalClient.put(
        "",
        UserInfo,
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "dah",
          "X-Module": "card",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      console.log(
        "updateCardErrorDah",
        err.response?.data || err.terminalResponse || err.message,
      );

      // Check if card doesn't exist - fallback to create
      const errorData = err.response?.data || err.terminalResponse;
      const statusString =
        typeof errorData === "object" ? errorData?.statusString : errorData;
      const subStatusCode =
        typeof errorData === "object" ? errorData?.subStatusCode : null;

      if (
        !triedFallback &&
        (statusString?.includes("Bad Request") ||
          subStatusCode === "cardNotFound")
      ) {
        console.log("Fallback: trying createCard after updateCard failed");
        return this.createCard(card, terminal, cardStatus, true);
      }
      throw err;
    }
  }

  async deleteCard(
    card: Card,
    terminal: Terminal,
    cardStatus?: { recno?: string | number },
  ): Promise<OperationResult> {
    console.debug("-----deleteCard DAH");

    const base64Creds = this.getCredentials(terminal);

    let recno: string | null = cardStatus?.recno?.toString() || null;

    if (!recno) {
      recno = await this.getRecordByUserID(card, terminal);
    }

    if (!recno) {
      console.log("RecNo not found, deletion operation cannot be performed");
      return { success: false, error: "RecNo not found" };
    }

    const payload: DahuaDeleteCard = {
      recno: recno,
    };

    const response = await this.terminalClient.delete(
      "",
      payload,
      {
        "Content-Type": "application/json",
        "X-Terminal": terminal.url,
        "X-Type": "dah",
        "X-Module": "card",
      },
      terminal,
      base64Creds,
    );

    return { success: true, data: response };
  }

  async batchDeleteCards(terminal: Terminal): Promise<OperationResult> {
    console.debug("-----batchDeleteCards DAH");

    const base64Creds = this.getCredentials(terminal);

    const response = await this.terminalClient.delete(
      "",
      {},
      {
        "Content-Type": "application/json",
        "X-Terminal": terminal.url,
        "X-Type": "dah",
        "X-Module": "cards",
      },
      terminal,
      base64Creds,
    );

    return { success: true, data: response };
  }

  async getRecordByUserID(
    card: Card,
    terminal: Terminal,
  ): Promise<string | null> {
    console.debug("-----getRecordByUserID DAH");

    const base64Creds = this.getCredentials(terminal);
    const params = { "condition.UserID": card.no };

    try {
      const response = await this.terminalClient.get(
        "",
        params,
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "dah",
          "X-Module": "card",
        },
        terminal,
        base64Creds,
      );

      const recNoMatch = response.match(/records\[0\]\.RecNo=(\d+)/);
      if (recNoMatch) {
        console.log("recNoMatch", recNoMatch[1]);
        return recNoMatch[1];
      }

      console.log("RecNo not found in response");
      return null;
    } catch (err: any) {
      console.error("Error getting RecNo", err);
      return null;
    }
  }

  async createPhoto(
    card: Card,
    terminal: Terminal,
    triedFallback: boolean = false,
  ): Promise<OperationResult> {
    console.debug("-----createPhoto DAH");

    if (!card.photo) {
      throw new Error("createPhoto: no card photo provided");
    }

    const base64Creds = this.getCredentials(terminal);
    const photoBase64 = await this.fetchPhotoAsBase64(card.photo);

    const userData: DahuaPhotoData = {
      UserID: card.no.toString(),
      Info: {
        PhotoData: [photoBase64],
      },
    };

    try {
      const response = await this.terminalClient.post(
        "",
        userData,
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "dah",
          "X-Module": "face",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      console.log(
        "createPhotoErrorDah",
        err.response?.data || err.terminalResponse || err.message,
      );

      // Check if photo already exists - fallback to update
      const errorData = err.response?.data || err.terminalResponse;
      const statusString =
        typeof errorData === "object" ? errorData?.statusString : errorData;
      const subStatusCode =
        typeof errorData === "object" ? errorData?.subStatusCode : null;

      if (
        !triedFallback &&
        (statusString?.includes("Bad Request") ||
          subStatusCode === "photoAlreadyExists")
      ) {
        console.log("Fallback: trying updatePhoto after createPhoto failed");
        return this.updatePhoto(card, terminal, true);
      }
      throw err;
    }
  }

  async updatePhoto(
    card: Card,
    terminal: Terminal,
    triedFallback: boolean = false,
  ): Promise<OperationResult> {
    console.debug("-----updatePhoto DAH");

    if (!card.photo) {
      throw new Error("updatePhoto: no card photo provided");
    }

    const base64Creds = this.getCredentials(terminal);
    const photoBase64 = await this.fetchPhotoAsBase64(card.photo);

    const userData: DahuaPhotoData = {
      UserID: card.no.toString(),
      Info: {
        PhotoData: [photoBase64],
      },
    };

    try {
      const response = await this.terminalClient.put(
        "",
        userData,
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "dah",
          "X-Module": "face",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      console.log(
        "updatePhotoErrorDah",
        err.response?.data || err.terminalResponse || err.message,
      );

      // Check if photo doesn't exist - fallback to create
      const errorData = err.response?.data || err.terminalResponse;
      const statusString =
        typeof errorData === "object" ? errorData?.statusString : errorData;
      const subStatusCode =
        typeof errorData === "object" ? errorData?.subStatusCode : null;

      if (
        !triedFallback &&
        (statusString?.includes("Bad Request") ||
          subStatusCode === "photoNotFound")
      ) {
        console.log("Fallback: trying createPhoto after updatePhoto failed");
        return this.createPhoto(card, terminal, true);
      }
      throw err;
    }
  }

  async fetchData(terminal: Terminal): Promise<DahuaFaceToken | null> {
    console.debug("-----fetchData DAH");

    const base64Creds = this.getCredentials(terminal);

    try {
      const response = await this.terminalClient.get(
        "",
        {},
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "dah",
          "X-Module": "face",
        },
        terminal,
        base64Creds,
      );

      return response;
    } catch (error) {
      console.error("Error fetching data:", error);
      return null;
    }
  }

  async fetchFaceData(terminal: Terminal): Promise<any> {
    console.debug("-----fetchFaceData DAH");

    const base64Creds = this.getCredentials(terminal);

    try {
      const tokenData = await this.fetchData(terminal);
      if (!tokenData) {
        return null;
      }

      const params: DahuaFaceDataRequest = {
        Token: tokenData.Token,
        Offset: 0,
        Count: 10000,
      };

      const response = await this.terminalClient.post(
        "",
        params,
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "dah",
          "X-Module": "faces",
        },
        terminal,
        base64Creds,
      );

      return response;
    } catch (error) {
      console.error("Error fetching face data:", error);
      return null;
    }
  }

  private async fetchPhotoAsBase64(photoPath: string): Promise<string> {
    try {
      const photoBuffer =
        await this.photoConverter.fetchPhotoFromUrl(photoPath);
      return this.photoConverter.blobToBase64(photoBuffer);
    } catch (error) {
      console.error("Error fetching photo", error);
      throw new Error("Failed to fetch photo from URL");
    }
  }
}
