import { Request, Response, NextFunction } from "express";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public subStatusCode?: string,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("API Error:", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      subStatusCode: err.subStatusCode,
      details: err.details,
    });
  }

  // Terminal returned error status (from TerminalClientService)
  if ("status" in err && "terminalResponse" in err) {
    const terminalError = err as any;
    console.error("Terminal Error:", {
      status: terminalError.status,
      statusText: terminalError.statusText,
      response: terminalError.terminalResponse,
    });

    return res.status(terminalError.status).json({
      success: false,
      message: `Terminal error: ${terminalError.statusText}`,
      terminalStatus: terminalError.status,
      terminalStatusText: terminalError.statusText,
      terminalResponse: terminalError.terminalResponse,
      subStatusCode: terminalError.terminalResponse?.subStatusCode,
    });
  }

  if (
    "code" in err &&
    (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT")
  ) {
    return res.status(503).json({
      success: false,
      message: "Terminal unreachable",
      subStatusCode: "terminalOffline",
    });
  }

  if ("response" in err && err.response) {
    const axiosError = err as any;
    return res.status(axiosError.response?.status || 500).json({
      success: false,
      message: axiosError.message,
      data: axiosError.response?.data,
    });
  }

  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
};
