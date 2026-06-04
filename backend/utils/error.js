"use strict";

/**
 * Base application error class.
 * All custom errors extend this for consistent handling.
 */
class AppError extends Error {
  constructor(message, statusCode, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguish operational from programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, "CONFLICT");
  }
}

class RateLimitError extends AppError {
  constructor(message = "Too many requests, please try again later") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}

class PaymentError extends AppError {
  constructor(message, details = null) {
    super(message, 402, "PAYMENT_ERROR", details);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(service = "Service") {
    super(`${service} is temporarily unavailable`, 503, "SERVICE_UNAVAILABLE");
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  PaymentError,
  ServiceUnavailableError,
};
