"use strict";

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { AuthenticationError } = require("../utils/errors");
const { refreshTokens } = require("../config/redis");
const logger = require("../utils/logger");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "15m";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "7d";

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("JWT secrets must be defined in environment variables");
}

// ─── Token Generation ────────────────────────────────────────────────────────
/**
 * Sign an access token (short-lived, 15min default).
 */
const signAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES,
    issuer: "bazaar.com.bd",
    audience: "bazaar-api",
  });
};

/**
 * Sign a refresh token (long-lived, 7 days default).
 */
const signRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
    issuer: "bazaar.com.bd",
    audience: "bazaar-api",
  });
};

/**
 * Generate both access and refresh tokens for a user.
 * Stores refresh token in Redis.
 */
const generateTokenPair = async (user) => {
  const payload = {
    id: user._id.toString(),
    role: user.role,
    email: user.email,
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ id: user._id.toString() });

  // Store refresh token hash in Redis (7 days)
  const tokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");
  await refreshTokens.set(user._id.toString(), tokenHash, 7 * 24 * 60 * 60);

  return { accessToken, refreshToken };
};

// ─── Token Verification ───────────────────────────────────────────────────────
/**
 * Verify an access token. Throws on invalid/expired.
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, ACCESS_SECRET, {
      issuer: "bazaar.com.bd",
      audience: "bazaar-api",
    });
  } catch (err) {
    logger.debug("Access token verification failed:", err.message);
    throw new AuthenticationError(
      err.name === "TokenExpiredError"
        ? "Access token has expired"
        : "Invalid access token",
    );
  }
};

/**
 * Verify a refresh token. Throws on invalid/expired.
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_SECRET, {
      issuer: "bazaar.com.bd",
      audience: "bazaar-api",
    });
  } catch (err) {
    logger.debug("Refresh token verification failed:", err.message);
    throw new AuthenticationError(
      err.name === "TokenExpiredError"
        ? "Session has expired, please log in again"
        : "Invalid refresh token",
    );
  }
};

/**
 * Validate that a refresh token matches what's stored in Redis.
 * Provides extra security against token theft (rotation detection).
 */
const validateRefreshToken = async (userId, refreshToken) => {
  const storedHash = await refreshTokens.get(userId.toString());
  if (!storedHash) {
    throw new AuthenticationError("Session not found. Please log in again.");
  }

  const incomingHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");
  if (storedHash !== incomingHash) {
    // Token mismatch — possible token theft, invalidate all sessions
    await refreshTokens.del(userId.toString());
    logger.warn(
      `Refresh token mismatch for user ${userId} — possible token theft`,
    );
    throw new AuthenticationError(
      "Security alert: invalid session. Please log in again.",
    );
  }

  return true;
};

/**
 * Invalidate all tokens for a user (logout).
 */
const revokeTokens = async (userId) => {
  await refreshTokens.del(userId.toString());
};

// ─── Cookie Helpers ──────────────────────────────────────────────────────────
const REFRESH_COOKIE_NAME = "bazaar_rt";
const ACCESS_COOKIE_NAME = "bazaar_at";

const getCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  maxAge,
});

const setAuthCookies = (res, { accessToken, refreshToken }) => {
  res.cookie(ACCESS_COOKIE_NAME, accessToken, getCookieOptions(15 * 60 * 1000)); // 15 min
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    getCookieOptions(7 * 24 * 60 * 60 * 1000),
  ); // 7 days
};

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE_NAME);
  res.clearCookie(REFRESH_COOKIE_NAME);
};

module.exports = {
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  validateRefreshToken,
  revokeTokens,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
  ACCESS_COOKIE_NAME,
};
