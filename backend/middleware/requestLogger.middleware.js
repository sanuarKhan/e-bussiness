"use strict";

const logger = require("../utils/logger");

const SENSITIVE_FIELDS = [
  "password",
  "confirmPassword",
  "token",
  "secret",
  "cvv",
  "cardNumber",
];

const sanitizeBody = (body) => {
  if (!body || typeof body !== "object") return body;
  const sanitized = { ...body };
  SENSITIVE_FIELDS.forEach((field) => {
    if (sanitized[field]) sanitized[field] = "[REDACTED]";
  });
  return sanitized;
};

const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?._id,
      userAgent: req.headers["user-agent"],
    };

    if (
      process.env.NODE_ENV === "development" &&
      req.body &&
      Object.keys(req.body).length > 0
    ) {
      logData.body = sanitizeBody(req.body);
    }

    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "http";
    logger[level](`${req.method} ${req.path}`, logData);
  });

  next();
};

module.exports = { requestLogger };
