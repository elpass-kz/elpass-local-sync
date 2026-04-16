import { Request } from "express";

export interface TerminalHeaders {
  "x-terminal": string;
  "x-module": "card" | "face" | "fizcard" | "cards" | "faces" | "door";
  "x-type": "hik" | "H" | "dah" | "D";
  "x-creds": string;
  "x-debug"?: string;
}

export interface TerminalRequest extends Request {
  headers: TerminalHeaders & Request["headers"];
}

export interface OperationResult {
  success: boolean;
  data?: any;
  recno?: string;
  subStatusCode?: string;
  error?: string;
  ver?: number;
}
