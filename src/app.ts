import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import cardsRouter from "./routes/cards";
import authRouter from "./routes/auth";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Terminal",
      "X-Module",
      "X-Type",
      "X-Creds",
      "X-Debug",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    credentials: false,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.options("*", cors());

app.get("/health", (_, res) => {
  res.status(200).json({
    success: true,
    message: "Service is healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/rpc", authRouter);
app.use("/api/cards", cardsRouter);

app.use((_, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use(errorHandler);

export default app;
