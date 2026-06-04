"use strict";

const mongoose = require("mongoose");
const { AppError } = require("../utils/errors");
const logger = require("../utils/logger");

/**
 * Converts Mongoose-specific errors into AppErrors.
 */
const normalizeMongooseError = (err) => {
  // Validation error
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return new AppError("Validation failed", 400, "VALIDATION_ERROR", details);
  }

  // Duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    return new AppError(
      `A record with ${field} '${value}' already exists`,
      409,
      "DUPLICATE_KEY",
    );
  }

  // Cast error (invalid ObjectId, etc.)
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid ${err.path}: ${err.value}`, 400, "INVALID_ID");
  }

  return null;
};

/**
 * Converts JWT-specific errors into AppErrors.
 */
const normalizeJwtError = (err) => {
  if (err.name === "JsonWebTokenError") {
    return new AppError(
      "Invalid token. Please log in again.",
      401,
      "INVALID_TOKEN",
    );
  }
  if (err.name === "TokenExpiredError") {
    return new AppError(
      "Your token has expired. Please log in again.",
      401,
      "TOKEN_EXPIRED",
    );
  }
  return null;
};

/**
 * Sends detailed error in development.
 */
const sendDevError = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    code: err.code,
    message: err.message,
    details: err.details,
    stack: err.stack,
    error: err,
  });
};

/**
 * Sends safe error in production (no stack traces, no internal details).
 */
const sendProdError = (err, res) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Programming or unknown error — don't leak details
  logger.error("UNHANDLED ERROR (programming error):", err);
  res.status(500).json({
    status: "error",
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went very wrong. Please try again later.",
  });
};

/**
 * 404 handler for unknown routes.
 */
const notFound = (req, res, next) => {
  next(
    new AppError(`Route ${req.originalUrl} not found`, 404, "ROUTE_NOT_FOUND"),
  );
};

/**
 * Global error handling middleware.
 * Must be registered LAST in the Express middleware stack.
 */
const errorHandler = (err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Log all errors
  if (err.statusCode >= 500) {
    logger.error("Server error:", {
      message: err.message,
      code: err.code,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id,
      stack: err.stack,
    });
  } else {
    logger.warn("Client error:", {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });
  }

  // Normalize known error types
  let normalizedError = err;

  const mongooseError = normalizeMongooseError(err);
  if (mongooseError) normalizedError = mongooseError;

  const jwtError = normalizeJwtError(err);
  if (jwtError) normalizedError = jwtError;

  // Handle multer file upload errors
  if (err.code === "LIMIT_FILE_SIZE") {
    normalizedError = new AppError(
      "File size exceeds the maximum allowed limit",
      400,
      "FILE_TOO_LARGE",
    );
  }

  if (process.env.NODE_ENV === "development") {
    sendDevError(normalizedError, res);
  } else {
    sendProdError(normalizedError, res);
  }
};

module.exports = { errorHandler, notFound };
