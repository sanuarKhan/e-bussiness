"use strict";

const {
  verifyAccessToken,
  ACCESS_COOKIE_NAME,
} = require("../services/jwt.service");
const User = require("../models/user.model");
const { AuthenticationError, AuthorizationError } = require("../utils/errors");

/**
 * Extracts Bearer token from Authorization header or cookie.
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  if (req.cookies && req.cookies[ACCESS_COOKIE_NAME]) {
    return req.cookies[ACCESS_COOKIE_NAME];
  }
  return null;
};

/**
 * Middleware: Require authenticated user.
 * Attaches req.user with full user document (excluding sensitive fields).
 */
const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next(
      new AuthenticationError("Authentication required. Please log in."),
    );
  }

  const decoded = verifyAccessToken(token); // Throws on invalid/expired

  const user = await User.findById(decoded.id).select(
    "-password -emailVerificationToken -passwordResetToken -phoneOTP -twoFactorSecret",
  );

  if (!user) {
    return next(
      new AuthenticationError("User account not found. Please log in again."),
    );
  }

  if (!user.isActive || user.isBanned) {
    return next(
      new AuthenticationError(
        "Your account has been suspended. Please contact support.",
      ),
    );
  }

  // Check if password changed after token was issued
  if (user.changedPasswordAfter(decoded.iat)) {
    return next(
      new AuthenticationError(
        "Password recently changed. Please log in again.",
      ),
    );
  }

  req.user = user;
  next();
};

/**
 * Middleware: Optionally authenticate (doesn't fail if no token).
 * Useful for public routes that have enhanced features when logged in.
 */
const optionalAuthenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.id).select(
      "-password -emailVerificationToken -passwordResetToken -phoneOTP -twoFactorSecret",
    );
    if (user && user.isActive && !user.isBanned) {
      req.user = user;
    }
  } catch {
    // Ignore auth errors for optional auth
  }

  next();
};

/**
 * Middleware factory: Restrict access by role.
 * Usage: authorize('admin'), authorize('admin', 'superadmin')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError("Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AuthorizationError(
          `This action requires one of the following roles: ${roles.join(", ")}`,
        ),
      );
    }
    next();
  };
};

/**
 * Middleware: Require verified email.
 */
const requireEmailVerified = (req, res, next) => {
  if (!req.user?.isEmailVerified) {
    return next(
      new AuthorizationError("Please verify your email address to continue."),
    );
  }
  next();
};

/**
 * Middleware: Allow access only to own resources or admins.
 * Usage: authorize then authorizeOwnerOrAdmin('userId')
 */
const authorizeOwnerOrAdmin = (resourceOwnerIdField) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }
    const ownerId =
      req.params[resourceOwnerIdField] || req.body[resourceOwnerIdField];
    const isOwner = req.user._id.toString() === ownerId?.toString();
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return next(new AuthorizationError());
    }
    next();
  };
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  requireEmailVerified,
  authorizeOwnerOrAdmin,
};
