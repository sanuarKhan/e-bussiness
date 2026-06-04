"use strict";

const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs = require("fs");

const LOG_DIR = process.env.LOG_DIR || "logs";

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Custom Log Formats ────────────────────────────────────────────────────
const { combine, timestamp, errors, json, colorize, printf, splat } =
  winston.format;

const developmentFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),
  splat(),
  printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : "";
    return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
  }),
);

const productionFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json(),
);

// ─── Transports ────────────────────────────────────────────────────────────
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format:
      process.env.NODE_ENV === "production"
        ? productionFormat
        : developmentFormat,
    silent: process.env.NODE_ENV === "test",
  }),
);

// File transports (production & development)
if (process.env.NODE_ENV !== "test") {
  // All logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "application-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
      format: productionFormat,
      zippedArchive: true,
    }),
  );

  // Error logs only
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "30d",
      level: "error",
      format: productionFormat,
      zippedArchive: true,
    }),
  );
}

// ─── Logger Instance ───────────────────────────────────────────────────────
const logger = winston.createLogger({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  transports,
  exitOnError: false,
});

// ─── HTTP Stream for Morgan ────────────────────────────────────────────────
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
