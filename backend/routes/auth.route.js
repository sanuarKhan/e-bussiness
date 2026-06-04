"use strict";

const express = require("express");
const { body, param } = require("express-validator");
const authController = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { passwordResetLimiter } = require("../middleware/rateLimiter");
const { validate } = require("../middleware/validate.middleware");

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────────────
const registerValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage("Name must be between 2 and 80 characters"),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    ),
  body("phone")
    .optional()
    .matches(/^(\+880|880|0)1[3-9]\d{8}$/)
    .withMessage("Please provide a valid Bangladeshi phone number"),
];

const loginValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

const forgotPasswordValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
];

const resetPasswordValidation = [
  param("token").notEmpty().withMessage("Reset token is required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    ),
];

const changePasswordValidation = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("New password must contain uppercase, lowercase, and number"),
];

// ─── Routes ──────────────────────────────────────────────────────────────────
router.post("/register", registerValidation, validate, authController.register);
router.post("/login", loginValidation, validate, authController.login);
router.post("/logout", authenticate, authController.logout);
router.post("/refresh-token", authController.refreshToken);

router.get("/me", authenticate, authController.getMe);

router.get("/verify-email/:token", authController.verifyEmail);
router.post(
  "/resend-verification",
  authenticate,
  authController.resendVerificationEmail,
);

router.post(
  "/forgot-password",
  passwordResetLimiter,
  forgotPasswordValidation,
  validate,
  authController.forgotPassword,
);
router.patch(
  "/reset-password/:token",
  resetPasswordValidation,
  validate,
  authController.resetPassword,
);
router.patch(
  "/change-password",
  authenticate,
  changePasswordValidation,
  validate,
  authController.changePassword,
);

module.exports = router;
