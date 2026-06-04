"use strict";

require("dotenv").config();
require("express-async-errors");

const http = require("http");
const app = require("./app");
const { connectDatabase } = require("./config/database");
const { connectRedis } = require("./config/redis");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
let server;

const shutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info("HTTP server closed.");

    try {
      const mongoose = require("mongoose");
      await mongoose.connection.close();
      logger.info("MongoDB connection closed.");

      const { redisClient } = require("./config/redis");
      await redisClient.quit();
      logger.info("Redis connection closed.");

      logger.info("Graceful shutdown complete.");
      process.exit(0);
    } catch (err) {
      logger.error("Error during shutdown:", err);
      process.exit(1);
    }
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error(
      "Could not close connections in time, forcefully shutting down",
    );
    process.exit(1);
  }, 30000);
};

// ─── Unhandled Rejections & Exceptions ────────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  shutdown("UNHANDLED_REJECTION");
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  shutdown("UNCAUGHT_EXCEPTION");
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ─── Bootstrap Application ─────────────────────────────────────────────────
const bootstrap = async () => {
  try {
    // Connect to databases
    await connectDatabase();
    logger.info("✅ MongoDB connected");

    await connectRedis();
    logger.info("✅ Redis connected");

    // Start HTTP server
    server = http.createServer(app);

    server.listen(PORT, () => {
      logger.info(`
╔══════════════════════════════════════════════════════╗
║          BAZAAR E-COMMERCE API SERVER                ║
╠══════════════════════════════════════════════════════╣
║  Status  : Running                                   ║
║  Port    : ${PORT.toString().padEnd(42)}║
║  Env     : ${NODE_ENV.padEnd(42)}║
║  PID     : ${process.pid.toString().padEnd(42)}║
╚══════════════════════════════════════════════════════╝
      `);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`Port ${PORT} is already in use`);
        process.exit(1);
      }
      throw err;
    });
  } catch (err) {
    logger.error("Bootstrap failed:", err);
    process.exit(1);
  }
};

bootstrap();
