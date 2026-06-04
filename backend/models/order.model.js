"use strict";

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  name: { type: String, required: true },
  image: { public_id: String, url: String },
  sku: String,
  variant: {
    name: String,
    value: String,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: { type: Number, default: 0 },
  subtotal: {
    type: Number,
    required: true,
  },
});

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  message: String,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  timestamp: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema(
  {
    // ── Identifiers ───────────────────────────────────────────────────────
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },

    // ── Customer ──────────────────────────────────────────────────────────
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    guestEmail: String, // For guest checkout

    // ── Items ─────────────────────────────────────────────────────────────
    items: {
      type: [orderItemSchema],
      validate: [(arr) => arr.length > 0, "Order must have at least one item"],
    },

    // ── Pricing Breakdown ─────────────────────────────────────────────────
    pricing: {
      subtotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0 },
      couponDiscount: { type: Number, default: 0 },
      shippingCost: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, required: true, min: 0 },
      currency: { type: String, default: "BDT" },
    },

    // ── Coupon ────────────────────────────────────────────────────────────
    coupon: {
      code: String,
      discountType: { type: String, enum: ["percentage", "fixed"] },
      discountValue: Number,
    },

    // ── Shipping & Delivery ───────────────────────────────────────────────
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      division: { type: String, required: true },
      district: { type: String, required: true },
      upazila: { type: String, required: true },
      area: { type: String, required: true },
      address: { type: String, required: true },
      postalCode: String,
    },
    shippingMethod: {
      type: String,
      enum: ["standard", "express", "same_day", "pickup"],
      default: "standard",
    },
    shippingProvider: {
      type: String,
      enum: ["pathao", "paperfly", "redx", "sundarban", "internal", null],
      default: null,
    },
    trackingNumber: String,
    trackingUrl: String,
    estimatedDelivery: Date,
    deliveredAt: Date,

    // ── Payment ───────────────────────────────────────────────────────────
    paymentMethod: {
      type: String,
      required: true,
      enum: [
        "bkash",
        "nagad",
        "rocket",
        "sslcommerz",
        "stripe",
        "cod",
        "bank_transfer",
      ],
    },
    paymentStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      default: "pending",
      index: true,
    },
    paymentDetails: {
      transactionId: String,
      gatewayTransactionId: String,
      paymentGateway: String,
      paidAt: Date,
      amount: Number,
      currency: String,
      refundedAmount: { type: Number, default: 0 },
      refundedAt: Date,
      metadata: mongoose.Schema.Types.Mixed,
    },

    // ── Order Status ──────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "pending", // Just placed, payment pending
        "confirmed", // Payment received
        "processing", // Being prepared
        "shipped", // Handed to courier
        "out_for_delivery", // Last mile
        "delivered", // Completed
        "cancelled", // Cancelled
        "returned", // Return requested
        "refunded", // Refund processed
      ],
      default: "pending",
      index: true,
    },
    statusHistory: [statusHistorySchema],
    cancelReason: String,
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ── Notes ─────────────────────────────────────────────────────────────
    customerNote: { type: String, maxlength: 500 },
    adminNote: { type: String, select: false },

    // ── Invoicing ─────────────────────────────────────────────────────────
    invoiceNumber: String,
    invoiceUrl: String,
    invoiceGeneratedAt: Date,

    // ── Metadata ──────────────────────────────────────────────────────────
    source: {
      type: String,
      enum: ["web", "mobile", "api", "admin"],
      default: "web",
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "paymentDetails.transactionId": 1 });
orderSchema.index({ invoiceNumber: 1 });

// ─── Virtual Fields ─────────────────────────────────────────────────────────
orderSchema.virtual("isDelivered").get(function () {
  return this.status === "delivered";
});

orderSchema.virtual("isCancellable").get(function () {
  return ["pending", "confirmed"].includes(this.status);
});

// ─── Pre-save Hooks ─────────────────────────────────────────────────────────
orderSchema.pre("save", function (next) {
  if (this.isNew && !this.orderNumber) {
    // Format: BZR-YYYYMMDD-XXXXX
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).toUpperCase().slice(2, 7);
    this.orderNumber = `BZR-${dateStr}-${random}`;
  }

  // Track status changes
  if (this.isModified("status") && !this.isNew) {
    if (!this.statusHistory) this.statusHistory = [];
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
    });

    if (this.status === "delivered") {
      this.deliveredAt = new Date();
    }
    if (this.status === "cancelled") {
      this.cancelledAt = new Date();
    }
  }

  next();
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
