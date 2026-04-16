import axios, { AxiosResponse } from "axios";
import { config } from "../config/environment";

/**
 * Reusable API client for Elpass database operations
 * Handles authentication headers automatically
 */
export class ApiClient {
  constructor(private baseUrl: string = config.elpassApiUrl) {}

  private getHeaders(
    token: string,
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async get<T>(
    endpoint: string,
    token: string,
    params?: Record<string, any>,
    extraHeaders?: Record<string, string>,
  ): Promise<AxiosResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    return axios.get<T>(url, {
      params,
      headers: this.getHeaders(token, extraHeaders),
    });
  }

  async post<T>(
    endpoint: string,
    token: string,
    data?: any,
    extraHeaders?: Record<string, string>,
  ): Promise<AxiosResponse<T>> {
    return axios.post<T>(`${this.baseUrl}${endpoint}`, data, {
      headers: this.getHeaders(token, extraHeaders),
    });
  }

  async patch<T>(
    endpoint: string,
    token: string,
    data?: any,
    params?: Record<string, any>,
    extraHeaders?: Record<string, string>,
  ): Promise<AxiosResponse<T>> {
    return axios.patch<T>(`${this.baseUrl}${endpoint}`, data, {
      params,
      headers: this.getHeaders(token, extraHeaders),
    });
  }

  async delete<T>(
    endpoint: string,
    token: string,
    params?: Record<string, any>,
  ): Promise<AxiosResponse<T>> {
    return axios.delete<T>(`${this.baseUrl}${endpoint}`, {
      params,
      headers: this.getHeaders(token),
    });
  }
}
