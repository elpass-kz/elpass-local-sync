import { Router, Request, Response, NextFunction } from "express";
import axios from "axios";
import { config } from "../config/environment";
import { ENDPOINTS } from "../config/endpoints";

const router = Router();

/**
 * POST /api/rpc/login
 * Proxy login request to PostgREST
 *
 * Body (JSON):
 *   { "email": "user@example.com", "pass": "password" }
 *
 * Response:
 *   [{ "token": "jwt-token-string" }]
 */
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, pass } = req.body;

    if (!email || !pass) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    const response = await axios.post(
      `${config.elpassApiUrl}${ENDPOINTS.RPC_LOGIN}`,
      { email, pass },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    res.json(response.data);
  } catch (error: any) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
      return;
    }
    next(error);
  }
});

export default router;
