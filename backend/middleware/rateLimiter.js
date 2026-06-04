"use strict";

const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const { RateLimitError } = require("../utils/errors");

const createRateLimitHandler = (message) => ({
  handler: (req, res, next, options) => {
    next(new RateLimitError(message));
  },
});

// ─── Standard API Rate Limiter ──────────────────────────────────────────────
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => req.ip,
  ...createRateLimitHandler(
    "Too many requests. Please try again in 15 minutes.",
  ),
});

// ─── Auth Rate Limiter (strict) ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  ...createRateLimitHandler(
    "Too many login attempts. Your account is temporarily locked. Please try again in 15 minutes.",
  ),
});

// ─── Payment Rate Limiter (strict) ─────────────────────────────────────────
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  ...createRateLimitHandler(
    "Too many payment requests. Please try again in 1 hour.",
  ),
});

// ─── Password Reset Rate Limiter ────────────────────────────────────────────
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  ...createRateLimitHandler(
    "Too many password reset requests. Please try again in 1 hour.",
  ),
});

// ─── Search Slow Down ───────────────────────────────────────────────────────
// Progressively slow down repeat requesters
const searchSlowDown = slowDown({
  windowMs: 5 * 60 * 1000, // 5 min
  delayAfter: 30,
  delayMs: (hits) => hits * 100, // 100ms added per request after limit
  maxDelayMs: 5000,
});

// ─── Upload Rate Limiter ────────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  ...createRateLimitHandler(
    "Too many file uploads. Please try again in 1 hour.",
  ),
});

module.exports = {
  rateLimiter,
  authLimiter,
  paymentLimiter,
  passwordResetLimiter,
  searchSlowDown,
  uploadLimiter,
};
