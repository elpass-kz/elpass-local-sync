import { Request, Response, NextFunction } from "express";
import { ApiError } from "./errorHandler";

interface JWTPayload {
  exp: number;
  iat: number;
  role?: string;
  email?: string;
  host?: string;
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      token?: string; // Raw JWT token for passing to API calls
    }
  }
}

/**
 * Middleware to extract and decode JWT token from Authorization header
 * Attaches decoded payload (including host) to req.user
 */
export function jwtAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new ApiError(401, "Authorization header is required");
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;

    if (!token) {
      throw new ApiError(401, "JWT token is required");
    }

    const payload = decodeJWT(token);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new ApiError(401, "JWT token has expired");
    }

    req.user = payload;
    req.token = token;

    next();
  } catch (error: any) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(401, `Invalid JWT token: ${error.message}`));
    }
  }
}

/**
 * Decodes a JWT token without verification
 * Same implementation as TokenService.decodeJWT
 */
function decodeJWT(token: string): JWTPayload {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error("Failed to decode JWT token");
  }
}
