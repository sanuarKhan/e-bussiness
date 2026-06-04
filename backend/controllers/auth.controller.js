"use strict";

const User = require("../models/user.model");
const {
  generateTokenPair,
  verifyRefreshToken,
  validateRefreshToken,
  revokeTokens,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
} = require("../services/jwt.service");
const emailService = require("../services/email.service"); //todo
const {
  AuthenticationError,
  ConflictError,
  ValidationError,
  NotFoundError,
} = require("../utils/errors");
const logger = require("../utils/logger");
const crypto = require("crypto");

// ─── Helper ──────────────────────────────────────────────────────────────────
const buildUserResponse = (user, tokens) => ({
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: user.avatar,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    preferences: user.preferences,
  },
  accessToken: tokens.accessToken,
});

// ─── Register ────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  const { name, email, phone, password } = req.body;

  // Check for existing user
  const existingUser = await User.findOne({
    $or: [{ email }, { phone: phone || null }],
  });
  if (existingUser) {
    throw new ConflictError(
      existingUser.email === email
        ? "An account with this email already exists"
        : "An account with this phone number already exists",
    );
  }

  // Create user
  const user = await User.create({
    name,
    email,
    phone,
    password,
    authProvider: "local",
  });

  // Send verification email
  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  try {
    await emailService.sendEmailVerification(user, verificationToken);
  } catch (emailErr) {
    logger.error("Failed to send verification email:", emailErr);
    // Don't fail registration if email fails
  }

  // Generate tokens
  const tokens = await generateTokenPair(user);
  setAuthCookies(res, tokens);

  // Log registration
  logger.info(`New user registered: ${user.email} (${user._id})`);

  res.status(201).json({
    status: "success",
    message: "Registration successful. Please verify your email.",
    data: buildUserResponse(user, tokens),
  });
};

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;

  // Find user with password field
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new AuthenticationError("Invalid email or password");
  }

  if (!user.isActive || user.isBanned) {
    throw new AuthenticationError(
      "Your account has been suspended. Please contact support.",
    );
  }

  // Update login metadata
  user.lastLoginAt = new Date();
  user.lastLoginIP = req.ip;
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save({ validateBeforeSave: false });

  const tokens = await generateTokenPair(user);
  setAuthCookies(res, tokens);

  logger.info(`User logged in: ${user.email} from ${req.ip}`);

  res.status(200).json({
    status: "success",
    message: "Login successful",
    data: buildUserResponse(user, tokens),
  });
};

// ─── Refresh Token ────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  const refreshToken =
    req.cookies[REFRESH_COOKIE_NAME] || req.body.refreshToken;

  if (!refreshToken) {
    throw new AuthenticationError("Refresh token not provided");
  }

  const decoded = verifyRefreshToken(refreshToken);
  await validateRefreshToken(decoded.id, refreshToken);

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive || user.isBanned) {
    throw new AuthenticationError("User not found or account suspended");
  }

  const tokens = await generateTokenPair(user);
  setAuthCookies(res, tokens);

  res.status(200).json({
    status: "success",
    message: "Token refreshed",
    data: { accessToken: tokens.accessToken },
  });
};

// ─── Logout ────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  const userId = req.user?._id;
  if (userId) {
    await revokeTokens(userId);
  }
  clearAuthCookies(res);

  res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
};

// ─── Get Current User ─────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id).populate("addresses");

  res.status(200).json({
    status: "success",
    data: { user },
  });
};

// ─── Email Verification ───────────────────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
  const { token } = req.params;
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new ValidationError(
      "Email verification token is invalid or has expired",
    );
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  logger.info(`Email verified for user: ${user.email}`);

  res.status(200).json({
    status: "success",
    message: "Email verified successfully",
  });
};

// ─── Resend Verification Email ────────────────────────────────────────────────
exports.resendVerificationEmail = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user.isEmailVerified) {
    return res.status(200).json({
      status: "success",
      message: "Email is already verified",
    });
  }

  const token = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });
  await emailService.sendEmailVerification(user, token);

  res.status(200).json({
    status: "success",
    message: "Verification email sent",
  });
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  // Always respond with success to prevent email enumeration
  if (!user) {
    return res.status(200).json({
      status: "success",
      message:
        "If an account exists for this email, you will receive a password reset link.",
    });
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    await emailService.sendPasswordReset(user, resetToken);
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    logger.error("Password reset email failed:", err);
    throw new Error("Error sending password reset email. Please try again.");
  }

  res.status(200).json({
    status: "success",
    message: "Password reset link sent to your email",
  });
};

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new ValidationError("Password reset token is invalid or has expired");
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Revoke all existing sessions
  await revokeTokens(user._id);

  const tokens = await generateTokenPair(user);
  setAuthCookies(res, tokens);

  logger.info(`Password reset successful for user: ${user.email}`);

  res.status(200).json({
    status: "success",
    message: "Password reset successful",
    data: buildUserResponse(user, tokens),
  });
};

// ─── Change Password ──────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+password");

  if (!(await user.comparePassword(currentPassword))) {
    throw new AuthenticationError("Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  // Revoke all sessions except current (force re-login on other devices)
  await revokeTokens(user._id);
  const tokens = await generateTokenPair(user);
  setAuthCookies(res, tokens);

  res.status(200).json({
    status: "success",
    message:
      "Password changed successfully. Other sessions have been logged out.",
    data: { accessToken: tokens.accessToken },
  });
};
