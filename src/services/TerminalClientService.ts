import axios, { AxiosInstance } from "axios";
import { Terminal } from "../models/Terminal";
import { config } from "../config/environment";

export class TerminalClientService {
  createClient(terminal: Terminal, base64Creds: string): AxiosInstance {
    const client = axios.create({
      baseURL: process.env.TERMINAL_PROXY_URL || "http://node_red:1880/terminals",
      timeout: config.terminalRequestTimeout,
      headers: {
        "X-Creds": base64Creds,
      },
      validateStatus: (status) => status < 500,
    });

    client.interceptors.request.use((config) => {
      console.log("\n=== REQUEST TO TERMINAL (via proxy) ===");
      console.log("URL:", (config.baseURL || "") + (config.url || ""));
      console.log("Method:", config.method?.toUpperCase());
      console.log("Terminal:", terminal.url);
      console.log("========================================\n");
      return config;
    });

    client.interceptors.response.use(
      (response) => {
        console.log("\n=== RESPONSE FROM TERMINAL ===");
        console.log("Status:", response.status, response.statusText);
        console.log("Data:", JSON.stringify(response.data, null, 2));
        console.log("==============================\n");
        return response;
      },
      (error) => {
        console.log("\n=== ERROR FROM TERMINAL ===");
        console.log("Message:", error.message);
        if (error.response) {
          console.log("Status:", error.response.status);
          console.log("Data:", JSON.stringify(error.response.data, null, 2));
        }
        console.log("===========================\n");
        return Promise.reject(error);
      },
    );

    return client;
  }

  async post(
    url: string,
    data: any,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    const client = this.createClient(terminal, base64Creds);
    const response = await client.post(url, data, { headers });
    if (response.status >= 400) {
      const error: any = new Error(`Terminal returned ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.terminalResponse = response.data;
      error.response = { data: response.data, status: response.status };
      throw error;
    }
    return response.data;
  }

  async put(
    url: string,
    data: any,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    const client = this.createClient(terminal, base64Creds);
    const response = await client.put(url, data, { headers });
    if (response.status >= 400) {
      const error: any = new Error(`Terminal returned ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.terminalResponse = response.data;
      error.response = { data: response.data, status: response.status };
      throw error;
    }
    return response.data;
  }

  async delete(
    url: string,
    data: any,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    const client = this.createClient(terminal, base64Creds);
    const response = await client.delete(url, { data, headers });
    if (response.status >= 400) {
      const error: any = new Error(`Terminal returned ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.terminalResponse = response.data;
      error.response = { data: response.data, status: response.status };
      throw error;
    }
    return response.data;
  }

  async get(
    url: string,
    params: Record<string, any>,
    headers: Record<string, string>,
    terminal: Terminal,
    base64Creds: string,
  ): Promise<any> {
    const client = this.createClient(terminal, base64Creds);
    const response = await client.get(url, { params, headers });
    if (response.status >= 400) {
      const error: any = new Error(`Terminal returned ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.terminalResponse = response.data;
      error.response = { data: response.data, status: response.status };
      throw error;
    }
    return response.data;
  }
}
