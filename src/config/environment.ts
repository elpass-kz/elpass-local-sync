import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

function generatePostgrestToken(secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: "service_role", iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const jwtSecret = process.env.PGRST_JWT_SECRET || "";

export const config = {
  node_env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3001", 10),
  logLevel: process.env.LOG_LEVEL || "info",

  picServer: process.env.PIC_SERVER || "http://localhost:9000/pic",

  terminalRequestTimeout: parseInt(
    process.env.TERMINAL_REQUEST_TIMEOUT || "30000",
    10,
  ),
  retryMaxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || "3", 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || "1000", 10),

  elpassApiUrl: process.env.ELPASS_API_URL || "http://postgrest:3000",
  elpassToken: jwtSecret ? generatePostgrestToken(jwtSecret) : "",
};

export const isDevelopment = config.node_env === "development";
export const isProduction = config.node_env === "production";
