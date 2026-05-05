import app from "./app";
import { config } from "./config/environment";

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`🚀 05.05 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${config.node_env}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

export default server;
