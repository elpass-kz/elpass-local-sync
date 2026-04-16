import { Terminal } from "../models/Terminal";
import { ApiClient } from "./ApiClient";
import { ENDPOINTS } from "../config/endpoints";

export class TerminalsService {
  private api: ApiClient;

  constructor(apiClient?: ApiClient) {
    this.api = apiClient || new ApiClient();
  }

  /**
   * Получить терминал по ID
   */
  async getTerminalById(id: string, token?: string): Promise<Terminal | null> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      console.log(`TerminalsService: Fetching terminal with id=${id}`);

      const response = await this.api.get<Terminal[]>(
        ENDPOINTS.TERMINALS,
        token,
        {
          id: `eq.${id}`,
        },
      );

      if (response.data.length === 0) {
        console.warn(`TerminalsService: Terminal with id=${id} not found`);
        return null;
      }

      return response.data[0];
    } catch (error: any) {
      console.error(
        `TerminalsService: Failed to fetch terminal with id=${id}`,
        error,
      );
      const wrappedError: any = new Error(
        `Failed to fetch terminal: ${error.message}`,
      );
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }

  async getTerminals(
    host?: string,
    objectGuid?: string,
    zones?: string | string[],
    token?: string,
  ): Promise<Terminal[]> {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      const params: any = {
        disabled: "neq.true",
      };

      if (host) {
        params.host = `eq.${host}`;
      }

      if (objectGuid) {
        const normalizedZones = Array.isArray(zones)
          ? zones
          : zones
            ? [zones]
            : [];

        if (normalizedZones.length > 0 && !normalizedZones.includes("all")) {
          const zoneConditions = normalizedZones
            .map((z) => `meta_->>zone.eq.${z}`)
            .join(",");
          params["and"] =
            `(meta_->>objectGuid.eq.${objectGuid},or(${zoneConditions},meta_->>zone.eq.gate,meta_->>zone.eq.parking))`;
        } else {
          // No zones specified or "all" - fetch all terminals for this objectGuid
          params["meta_->>objectGuid"] = `eq.${objectGuid}`;
        }
      }

      const response = await this.api.get<Terminal[]>(
        ENDPOINTS.TERMINALS,
        token,
        params,
      );

      console.log(
        `TerminalsService: Fetched ${response.data.length} terminals${host ? ` for host=${host}` : ""}${objectGuid ? ` for objectGuid=${objectGuid}` : ""}${zones ? ` for zones=${Array.isArray(zones) ? zones.join(",") : zones}` : ""}`,
      );

      return response.data;
    } catch (error: any) {
      console.error("TerminalsService: Failed to fetch terminals", error);
      const wrappedError: any = new Error(
        `Failed to fetch terminals: ${error.message}`,
      );
      wrappedError.response = error.response;
      throw wrappedError;
    }
  }
}
