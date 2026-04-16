import FormData from "form-data";
import { Card } from "../../models/Card";
import { Terminal } from "../../models/Terminal";
import { OperationResult } from "../../types/request.types";
import {
  HikUserInfo,
  HikCardInfo,
  HikUserInfoDelCond,
  HikFaceDataRecord,
} from "../../types/hik.types";
import { PassType } from "../../types/card-upload.types";
import { TerminalClientService } from "../TerminalClientService";
import { PhotoConverterService } from "../PhotoConverterService";
import {
  formatDateForHik,
  getDefaultStartTime,
  getDefaultEndTime,
} from "../../utils/dateFormatter";
import { formatCredentials } from "../../utils/credentialsEncoder";

export class HikCardService {
  constructor(
    private terminalClient: TerminalClientService,
    private photoConverter: PhotoConverterService,
    private host?: string,
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
    userToken?: string,
  ): Promise<OperationResult> {
    console.log("HIK createCard triggered");

    const base64Creds = this.getCredentials(terminal);

    const UserInfo = this.buildUserInfo(card, terminal);
    console.log({ UserInfo, base64Creds });

    try {
      // Create user first
      const response = await this.terminalClient.post(
        "",
        { UserInfo },
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "hik",
          "X-Module": "card",
          ...(userToken && { Authorization: userToken }),
        },
        terminal,
        base64Creds,
      );

      if (response.statusString === "OK") {
        console.log("User created successfully", response);
        return { success: true, data: response };
      } else {
        console.log("response", response);
        return {
          success: false,
          error:
            response.subStatusCode ||
            response.statusString ||
            "Error creating card",
          data: response,
        };
      }
    } catch (err: any) {
      if (err.response?.data?.subStatusCode === "cardNoAlreadyExist") {
        return {
          success: true,
          subStatusCode: "cardNoAlreadyExist",
          data: err.response?.data,
        };
      }

      // Return error with terminal response
      return {
        success: false,
        error: err.terminalResponse
          ? JSON.stringify(err.terminalResponse).substring(0, 500)
          : err.message || String(err).substring(0, 500),
        data: err.response?.data,
      };
    }
  }

  async createPhysicalCard(
    card: Card,
    terminal: Terminal,
  ): Promise<OperationResult> {
    console.debug("-----createPhysicalCard HIK");

    const base64Creds = this.getCredentials(terminal);

    const CardInfo: HikCardInfo = {
      employeeNo: card.no.toString(),
      cardNo: card.no.toString(),
      cardType: "normalCard",
    };

    try {
      const response = await this.terminalClient.post(
        "",
        { CardInfo },
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "hik",
          "X-Module": "fizcard",
        },
        terminal,
        base64Creds,
      );

      console.log("Physical card added successfully", response);
      return { success: true, data: response };
    } catch (err: any) {
      if (err.response?.data?.subStatusCode === "cardNoAlreadyExist") {
        return {
          success: true,
          subStatusCode: "cardNoAlreadyExist",
          data: err.response?.data,
        };
      }

      // Return error with terminal response
      return {
        success: false,
        error: err.terminalResponse
          ? JSON.stringify(err.terminalResponse).substring(0, 500)
          : err.message || String(err).substring(0, 500),
        data: err.response?.data,
      };
    }
  }

  async updateCard(card: Card, terminal: Terminal): Promise<OperationResult> {
    console.debug("-----updateCard HIK");

    const base64Creds = this.getCredentials(terminal);

    const UserInfo = this.buildUserInfo(card, terminal);

    try {
      const response = await this.terminalClient.put(
        "",
        { UserInfo },
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "hik",
          "X-Module": "card",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      console.log("updateCardErrorHik!!!!!!!!", err.response?.data);

      // Fallback to create if user doesn't exist
      if (
        err.response?.data?.subStatusCode === "employeeNoNotExist" ||
        err.response?.data?.subStatusCode === "deviceUserNotExist"
      ) {
        return this.createCard(card, terminal);
      }

      // Return error with terminal response
      return {
        success: false,
        error: err.terminalResponse
          ? JSON.stringify(err.terminalResponse).substring(0, 500)
          : err.message || String(err).substring(0, 500),
        data: err.response?.data,
      };
    }
  }

  async deleteCard(card: Card, terminal: Terminal): Promise<OperationResult> {
    console.debug("-----deleteCard HIK");

    const base64Creds = this.getCredentials(terminal);

    const UserInfoDelCond: HikUserInfoDelCond = {
      EmployeeNoList: [{ employeeNo: card.no }],
    };

    try {
      const response = await this.terminalClient.delete(
        "",
        { UserInfoDelCond },
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "hik",
          "X-Module": "card",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      // Return error with terminal response
      return {
        success: false,
        error: err.terminalResponse
          ? JSON.stringify(err.terminalResponse).substring(0, 500)
          : err.message || String(err).substring(0, 500),
        data: err.response?.data,
      };
    }
  }

  async getCards(terminal: Terminal): Promise<any[]> {
    const maxResults = 30;
    let position = 0;
    let allEmployeeNos: any[] = [];

    const base64Creds = this.getCredentials(terminal);

    try {
      while (true) {
        const payload = {
          UserInfoSearchCond: {
            searchID: "1",
            searchResultPosition: position,
            maxResults: maxResults,
          },
        };

        const response = await this.terminalClient.post(
          "",
          payload,
          {
            "Content-Type": "application/json",
            "X-Terminal": terminal.url,
            "X-Type": "hik",
            "X-Module": "cards",
          },
          terminal,
          base64Creds,
        );

        console.log("resp", response);
        const fetchedUsers = response.UserInfoSearch?.UserInfo || [];

        if (fetchedUsers.length === 0) {
          break;
        }

        allEmployeeNos = [
          ...allEmployeeNos,
          ...fetchedUsers.map((user: any) => ({ employeeNo: user.employeeNo })),
        ];
        position += maxResults;

        if (fetchedUsers.length < maxResults) {
          break;
        }
      }

      return allEmployeeNos;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async batchDeleteCards(terminal: Terminal): Promise<OperationResult> {
    const base64Creds = this.getCredentials(terminal);

    const employeeNoList = await this.getCards(terminal);

    const UserInfoDelCond: HikUserInfoDelCond = {
      EmployeeNoList: employeeNoList.map((item) => ({
        employeeNo: item.employeeNo,
      })),
    };

    const response = await this.terminalClient.delete(
      "",
      { UserInfoDelCond },
      {
        "Content-Type": "application/json",
        "X-Terminal": terminal.url,
        "X-Type": "hik",
        "X-Module": "cards",
      },
      terminal,
      base64Creds,
    );

    return { success: true, data: response };
  }

  private buildUserInfo(card: Card, terminal: Terminal): HikUserInfo {
    const startTime = card.begin_at
      ? new Date(card.begin_at)
      : getDefaultStartTime();
    const endTime = card.end_at
      ? new Date(card.end_at)
      : getDefaultEndTime(startTime);

    const userInfo: HikUserInfo = {
      employeeNo: card.no.toString(),
      name: card.name,
      gender: "male",
      userType: card.isBlocked === true ? "blackList" : "normal",
      Valid: {
        enable: true,
        beginTime: formatDateForHik(startTime),
        endTime: formatDateForHik(endTime),
      },
      doorRight: "1",
      RightPlan: [{ doorNo: 1, planTemplateNo: "1" }],
    };

    if (this.host === "ast-yourt" && terminal.meta_?.zone === "nexpo") {
      userInfo.doorRight = "1,2";
      userInfo.RightPlan = [
        { doorNo: 1, planTemplateNo: "1" },
        { doorNo: 2, planTemplateNo: "1" },
      ];
    }

    // For GUEST passType, always set userVerifyMode and password
    const passType = card.meta_?.passType;
    if (passType === PassType.GUEST && card.meta_?.pin) {
      userInfo.userVerifyMode = "cardOrfaceOrPw";
      userInfo.password = card.meta_.pin;
    }
    // PIN support for other passTypes
    else if (card.meta_?.pin && card.meta_.pin.trim() !== "") {
      userInfo.userVerifyMode = "cardOrfaceOrPw";
      userInfo.password = card.meta_.pin;
    }

    return userInfo;
  }

  async createPhoto(card: Card, terminal: Terminal): Promise<OperationResult> {
    if (!card.photo) {
      throw new Error("createPhoto: no card photo provided");
    }

    console.debug("-----createPhoto HIK", card);

    const base64Creds = this.getCredentials(terminal);

    const FaceImage = await this.photoConverter.fetchPhotoFromUrl(card.photo);

    const faceData: HikFaceDataRecord = {
      name: card.name,
      FPID: card.no.toString(),
      FDID: "1",
      faceLibType: "blackFD",
      city: "Astana",
      gender: "male",
      certificateType: "officerID",
      certificateNumber: "",
    };

    const formData = new FormData();
    formData.append("FaceDataRecord", JSON.stringify(faceData));
    formData.append("FaceImage", FaceImage, {
      filename: "face.jpg",
      contentType: "image/jpeg",
    });

    try {
      const response = await this.terminalClient.post(
        "",
        formData,
        {
          ...formData.getHeaders(),
          "X-Terminal": terminal.url,
          "X-Type": "hik",
          "X-Module": "face",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      // Check if error contains deviceUserAlreadyExistFace in multiple places
      const errorData = err.response?.data;
      const terminalResponse = err.terminalResponse;
      let subStatusCode = errorData?.subStatusCode;

      // If terminalResponse is a string, try to parse it
      if (typeof terminalResponse === "string") {
        try {
          const parsed = JSON.parse(terminalResponse);
          subStatusCode = subStatusCode || parsed.subStatusCode;
        } catch (e) {
          // Not JSON, ignore
        }
      } else if (
        typeof terminalResponse === "object" &&
        terminalResponse?.subStatusCode
      ) {
        subStatusCode = subStatusCode || terminalResponse.subStatusCode;
      }

      // Face already exists - not fatal
      if (subStatusCode === "deviceUserAlreadyExistFace") {
        return {
          success: true,
          subStatusCode: "deviceUserAlreadyExistFace",
          data: errorData,
        };
      }

      // Employee doesn't exist - try creating card first, then photo
      if (
        subStatusCode === "employeeNoNotExist" ||
        subStatusCode === "deviceUserNotExist"
      ) {
        console.log(
          "Employee doesn't exist, creating card first then retrying photo",
        );
        try {
          // Create card first
          const cardResult = await this.createCard(card, terminal);
          if (!cardResult.success) {
            return {
              success: false,
              error: `Failed to create card: ${cardResult.error || "Unknown error"}`,
              data: err.response?.data,
            };
          }

          // Retry creating photo
          const retryResponse = await this.terminalClient.post(
            "",
            formData,
            {
              ...formData.getHeaders(),
              "X-Terminal": terminal.url,
              "X-Type": "hik",
              "X-Module": "face",
            },
            terminal,
            base64Creds,
          );

          return { success: true, data: retryResponse };
        } catch (retryErr: any) {
          return {
            success: false,
            error: retryErr.terminalResponse
              ? JSON.stringify(retryErr.terminalResponse).substring(0, 500)
              : retryErr.message || String(retryErr).substring(0, 500),
            data: retryErr.response?.data,
          };
        }
      }

      // Return error with terminal response
      return {
        success: false,
        error: err.terminalResponse
          ? JSON.stringify(err.terminalResponse).substring(0, 500)
          : err.message || String(err).substring(0, 500),
        data: err.response?.data,
      };
    }
  }

  async updatePhoto(card: Card, terminal: Terminal): Promise<OperationResult> {
    if (!card.photo) {
      throw new Error("updatePhoto: no card photo provided");
    }

    console.debug("-----updatePhoto HIK", card);

    const base64Creds = this.getCredentials(terminal);

    const FaceImage = await this.photoConverter.fetchPhotoFromUrl(card.photo);

    const formData = new FormData();
    formData.append(
      "FaceDataRecord",
      JSON.stringify({
        faceLibType: "blackFD",
        FDID: "1",
        FPID: String(card.no),
        name: card.name,
      }),
    );
    formData.append("FaceImage", FaceImage, {
      filename: "face.jpg",
      contentType: "image/jpeg",
    });

    try {
      const response = await this.terminalClient.put(
        "",
        formData,
        {
          ...formData.getHeaders(),
          "X-Terminal": terminal.url,
          "X-Type": "hik",
          "X-Module": "face",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      // Check if error contains codes in multiple places
      const errorData = err.response?.data;
      const terminalResponse = err.terminalResponse;
      let subStatusCode = errorData?.subStatusCode;

      // If terminalResponse is a string, try to parse it
      if (typeof terminalResponse === "string") {
        try {
          const parsed = JSON.parse(terminalResponse);
          subStatusCode = subStatusCode || parsed.subStatusCode;
        } catch (e) {
          // Not JSON, ignore
        }
      } else if (
        typeof terminalResponse === "object" &&
        terminalResponse?.subStatusCode
      ) {
        subStatusCode = subStatusCode || terminalResponse.subStatusCode;
      }

      // Face already exists - not fatal
      if (subStatusCode === "deviceUserAlreadyExistFace") {
        return {
          success: true,
          subStatusCode: "deviceUserAlreadyExistFace",
          data: errorData,
        };
      }

      // Fallback to create if face doesn't exist
      if (subStatusCode === "faceDataPIDError") {
        return this.createPhoto(card, terminal);
      }

      // Return error with terminal response
      return {
        success: false,
        error: err.terminalResponse
          ? JSON.stringify(err.terminalResponse).substring(0, 500)
          : err.message || String(err).substring(0, 500),
        data: err.response?.data,
      };
    }
  }

  async deletePhoto(card: Card, terminal: Terminal): Promise<OperationResult> {
    console.log("deletePhoto HIK");

    const base64Creds = this.getCredentials(terminal);

    try {
      const response = await this.terminalClient.delete(
        "",
        { FPID: [{ value: String(card.no) }] },
        {
          "Content-Type": "application/json",
          "X-Terminal": terminal.url,
          "X-Type": "hik",
          "X-Module": "face",
        },
        terminal,
        base64Creds,
      );

      return { success: true, data: response };
    } catch (err: any) {
      // Return error with terminal response
      return {
        success: false,
        error: err.terminalResponse
          ? JSON.stringify(err.terminalResponse).substring(0, 500)
          : err.message || String(err).substring(0, 500),
        data: err.response?.data,
      };
    }
  }
}
