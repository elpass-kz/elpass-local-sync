import AxiosDigestAuth from "@mhoc/axios-digest-auth";
import { Terminal } from "../models/Terminal";
import { config } from "../config/environment";
import { resolveTerminalRoute } from "./TerminalUrlResolver";

type HttpMethod = "POST" | "PUT" | "DELETE" | "GET";

/**
 * Extract routing headers and return clean headers for the terminal request.
 */
function extractRoutingHeaders(headers: Record<string, string>): {
  type: string;
  module: string;
  terminal: string;
  cleanHeaders: Record<string, string>;
} {
  const type = headers["X-Type"] || "";
  const module = headers["X-Module"] || "";
  const terminal = headers["X-Terminal"] || "";

  const cleanHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!["X-Type", "X-Module", "X-Terminal", "X-Creds"].includes(key)) {
      cleanHeaders[key] = value;
    }
  }

  return { type, module, terminal, cleanHeaders };
}

/**
 * Get the base URL for a terminal from its local IP.
 */
function getTerminalBaseUrl(terminal: Terminal): string {
  const localIp = terminal.meta_?.local_ip;
  if (!localIp) {
    throw new Error(
      `Terminal "${terminal.url}" (${terminal.name}) has no local_ip configured in meta_`,
    );
  }
  // Use http:// for local network access
  return localIp.startsWith("http") ? localIp : `http://${localIp}`;
}

/**
 * Decode base64 credentials to username:password.
 */
function decodeCredentials(base64Creds: string): {
  username: string;
  password: string;
} {
  const decoded = Buffer.from(base64Creds, "base64").toString("utf-8");
  const colonIdx = decoded.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("Invalid credentials format");
  }
  return {
    username: decoded.substring(0, colonIdx),
    password: decoded.substring(colonIdx + 1),
  };
}

export class TerminalClientService {
  /**
   * Execute a request to the terminal using Digest Auth and resolved vendor paths.
   */
  private async request(
    callerMethod: HttpMethod,
    _url: string,
    dataOrParams: any,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
    isGetRequest: boolean = false,
  ): Promise<any> {
    const { type, module, cleanHeaders } = extractRoutingHeaders(headers);
    const route = resolveTerminalRoute(type, module, callerMethod);
    const baseUrl = getTerminalBaseUrl(terminal);
    const { username, password } = decodeCredentials(base64Creds);

    const fullUrl = `${baseUrl}${route.path}`;

    console.log("\n=== REQUEST TO TERMINAL (DIRECT) ===");
    console.log("Terminal:", terminal.url, `(${terminal.meta_?.local_ip})`);
    console.log("Route:", `${type}/${module} ${callerMethod} -> ${route.method} ${route.path}`);
    console.log("URL:", fullUrl);
    console.log("Username:", username);
    console.log("====================================\n");

    const digestAuth = new AxiosDigestAuth({
      username,
      password,
    });

    try {
      const axiosConfig: any = {
        url: fullUrl,
        method: route.method,
        headers: cleanHeaders,
        timeout: config.terminalRequestTimeout,
        validateStatus: (status: number) => status < 500,
      };

      if (isGetRequest) {
        axiosConfig.params = dataOrParams;
      } else {
        axiosConfig.data = dataOrParams;
      }

      const response = await digestAuth.request(axiosConfig);

      console.log("\n=== RESPONSE FROM TERMINAL ===");
      console.log("Status:", response.status, response.statusText);
      console.log("Data:", JSON.stringify(response.data, null, 2));
      console.log("==============================\n");

      if (response.status >= 400) {
        const error: any = new Error(
          `Terminal returned ${response.status}: ${response.statusText}`,
        );
        error.status = response.status;
        error.statusText = response.statusText;
        error.terminalResponse = response.data;
        error.response = { data: response.data, status: response.status };
        throw error;
      }

      return response.data;
    } catch (err: any) {
      if (err.terminalResponse !== undefined) {
        // Already formatted error from above
        throw err;
      }

      console.log("\n=== ERROR FROM TERMINAL ===");
      console.log("Message:", err.message);
      if (err.response) {
        console.log("Status:", err.response.status);
        console.log("Data:", JSON.stringify(err.response.data, null, 2));
      }
      console.log("===========================\n");
      throw err;
    }
  }

  async post(
    url: string,
    data: any,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    return this.request("POST", url, data, headers, terminal, base64Creds);
  }

  async put(
    url: string,
    data: any,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    return this.request("PUT", url, data, headers, terminal, base64Creds);
  }

  async delete(
    url: string,
    data: any,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    return this.request("DELETE", url, data, headers, terminal, base64Creds);
  }

  async get(
    url: string,
    params: Record<string, any>,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    return this.request("GET", url, params, headers, terminal, base64Creds, true);
  }
}
