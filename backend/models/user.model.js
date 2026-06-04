"use strict";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, enum: ["home", "work", "other"], default: "home" },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    division: { type: String, required: true },
    district: { type: String, required: true },
    upazila: { type: String, required: true },
    area: { type: String, required: true },
    address: { type: String, required: true, trim: true },
    postalCode: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const userSchema = new mongoose.Schema(
  {
    // ── Core Identity ─────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name cannot exceed 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: [
        /^(\+880|880|0)1[3-9]\d{8}$/,
        "Please provide a valid Bangladeshi phone number",
      ],
    },
    password: {
      type: String,
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never returned in queries by default
    },
    avatar: {
      public_id: String,
      url: { type: String, default: null },
    },

    // ── Role & Permissions ────────────────────────────────────────────────
    role: {
      type: String,
      enum: ["customer", "vendor", "admin", "superadmin"],
      default: "customer",
    },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String, default: null },

    // ── OAuth ─────────────────────────────────────────────────────────────
    googleId: { type: String, unique: true, sparse: true },
    facebookId: { type: String, unique: true, sparse: true },
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook"],
      default: "local",
    },

    // ── Addresses ─────────────────────────────────────────────────────────
    addresses: {
      type: [addressSchema],
      validate: [
        (arr) => arr.length <= 5,
        "You can have a maximum of 5 saved addresses",
      ],
    },

    // ── Preferences ───────────────────────────────────────────────────────
    preferences: {
      language: { type: String, enum: ["en", "bn"], default: "en" },
      currency: { type: String, enum: ["BDT", "USD"], default: "BDT" },
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
      },
    },

    // ── Security Tokens ───────────────────────────────────────────────────
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    phoneOTP: { type: String, select: false },
    phoneOTPExpires: { type: Date, select: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },

    // ── Session Tracking ──────────────────────────────────────────────────
    passwordChangedAt: Date,
    lastLoginAt: Date,
    lastLoginIP: String,
    loginCount: { type: Number, default: 0 },

    // ── Analytics ─────────────────────────────────────────────────────────
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    loyaltyPoints: { type: Number, default: 0 },

    // ── Vendor-specific (only when role === 'vendor') ──────────────────────
    vendor: {
      shopName: String,
      shopSlug: { type: String, unique: true, sparse: true },
      shopDescription: String,
      shopLogo: { public_id: String, url: String },
      shopBanner: { public_id: String, url: String },
      isApproved: { type: Boolean, default: false },
      approvedAt: Date,
      commissionRate: { type: Number, default: 10 }, // percentage
      balance: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      bankDetails: {
        bankName: String,
        accountName: String,
        accountNumber: String,
        routingNumber: String,
      },
      mobilePayment: {
        bkash: String,
        nagad: String,
        rocket: String,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ "vendor.shopSlug": 1 });
userSchema.index({ createdAt: -1 });

// ─── Virtual Fields ─────────────────────────────────────────────────────────
userSchema.virtual("fullAddress").get(function () {
  const defaultAddr = this.addresses.find((a) => a.isDefault);
  if (!defaultAddr) return null;
  return `${defaultAddr.address}, ${defaultAddr.area}, ${defaultAddr.district}`;
});

// ─── Pre-save Hooks ─────────────────────────────────────────────────────────
// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const rounds = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
  this.password = await bcrypt.hash(this.password, rounds);

  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000); // 1 sec in past for JWT iat check
  }

  next();
});

// Ensure only one default address
userSchema.pre("save", function (next) {
  if (this.isModified("addresses")) {
    const defaults = this.addresses.filter((a) => a.isDefault);
    if (defaults.length > 1) {
      // Keep only the last set default
      const lastDefault = defaults[defaults.length - 1];
      this.addresses.forEach((a) => {
        a.isDefault = a._id.equals(lastDefault._id);
      });
    } else if (defaults.length === 0 && this.addresses.length > 0) {
      this.addresses[0].isDefault = true;
    }
  }
  next();
});

// ─── Instance Methods ────────────────────────────────────────────────────────
/**
 * Compare plain password against stored hash.
 */
userSchema.methods.comparePassword = async function (plainPassword) {
  if (!this.password) return false;
  return bcrypt.compare(plainPassword, this.password);
};

/**
 * Check if JWT was issued before password was changed.
 */
userSchema.methods.changedPasswordAfter = function (jwtIat) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return jwtIat < changedTimestamp;
  }
  return false;
};

/**
 * Generate and store a secure email verification token.
 */
userSchema.methods.createEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token; // Return unhashed (sent in email)
};

/**
 * Generate and store a secure password reset token.
 */
userSchema.methods.createPasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

/**
 * Generate a 6-digit OTP for phone verification.
 */
userSchema.methods.createPhoneOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.phoneOTP = crypto.createHash("sha256").update(otp).digest("hex");
  this.phoneOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return otp;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
