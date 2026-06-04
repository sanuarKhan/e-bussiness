"use strict";

const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "Color", "Size"
  options: [
    {
      value: { type: String, required: true }, // e.g. "Red", "XL"
      label: String,
      priceAdjustment: { type: Number, default: 0 },
      stock: { type: Number, required: true, min: 0, default: 0 },
      sku: String,
      image: { public_id: String, url: String },
    },
  ],
});

const imageSchema = new mongoose.Schema({
  public_id: { type: String, required: true },
  url: { type: String, required: true },
  alt: { type: String, default: "" },
  isMain: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
});

const specificationSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: String, required: true },
});

const productSchema = new mongoose.Schema(
  {
    // ── Core Info ─────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      minlength: [3, "Product name must be at least 3 characters"],
      maxlength: [200, "Product name cannot exceed 200 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      minlength: [20, "Description must be at least 20 characters"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    shortDescription: {
      type: String,
      maxlength: [300, "Short description cannot exceed 300 characters"],
    },

    // ── Pricing ───────────────────────────────────────────────────────────
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    compareAtPrice: {
      type: Number,
      min: [0, "Compare at price cannot be negative"],
      default: null,
    },
    costPrice: {
      type: Number,
      min: 0,
      select: false, // Internal use only
    },
    currency: { type: String, default: "BDT", enum: ["BDT", "USD"] },

    // ── Inventory ─────────────────────────────────────────────────────────
    sku: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    barcode: { type: String, trim: true },
    stock: {
      type: Number,
      required: [true, "Stock quantity is required"],
      min: [0, "Stock cannot be negative"],
      default: 0,
    },
    lowStockThreshold: { type: Number, default: 5 },
    trackInventory: { type: Boolean, default: true },
    allowBackorder: { type: Boolean, default: false },

    // ── Media ─────────────────────────────────────────────────────────────
    images: {
      type: [imageSchema],
      validate: [(arr) => arr.length <= 10, "Maximum 10 images allowed"],
    },

    // ── Categorization ────────────────────────────────────────────────────
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
      index: true,
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    brand: { type: String, trim: true, index: true },
    tags: {
      type: [String],
      validate: [(arr) => arr.length <= 20, "Maximum 20 tags allowed"],
    },

    // ── Variants ──────────────────────────────────────────────────────────
    hasVariants: { type: Boolean, default: false },
    variants: [variantSchema],

    // ── Specifications ────────────────────────────────────────────────────
    specifications: [specificationSchema],

    // ── Shipping ──────────────────────────────────────────────────────────
    shipping: {
      weight: { type: Number, min: 0 }, // in grams
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
        unit: { type: String, default: "cm" },
      },
      isFreeShipping: { type: Boolean, default: false },
      shippingClass: {
        type: String,
        enum: ["standard", "express", "fragile", "heavy", "digital"],
        default: "standard",
      },
    },

    // ── SEO ───────────────────────────────────────────────────────────────
    seo: {
      metaTitle: { type: String, maxlength: 70 },
      metaDescription: { type: String, maxlength: 160 },
      metaKeywords: [String],
      canonicalUrl: String,
      ogImage: String,
    },

    // ── Ratings & Reviews ─────────────────────────────────────────────────
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      distribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
      },
    },

    // ── Status & Visibility ───────────────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "active", "archived", "out_of_stock"],
      default: "draft",
      index: true,
    },
    isPublished: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    publishedAt: Date,

    // ── Analytics ─────────────────────────────────────────────────────────
    viewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    wishlistCount: { type: Number, default: 0 },

    // ── Vendor / Supplier ─────────────────────────────────────────────────
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    supplier: {
      name: String,
      productUrl: String,
      supplierSku: String,
    },

    // ── Admin ─────────────────────────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
productSchema.index({
  name: "text",
  description: "text",
  brand: "text",
  tags: "text",
});
productSchema.index({ category: 1, status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ "ratings.average": -1 });
productSchema.index({ soldCount: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ isFeatured: 1, status: 1 });
productSchema.index({ vendor: 1 });

// ─── Virtual Fields ─────────────────────────────────────────────────────────
productSchema.virtual("discountPercentage").get(function () {
  if (!this.compareAtPrice || this.compareAtPrice <= this.price) return 0;
  return Math.round(
    ((this.compareAtPrice - this.price) / this.compareAtPrice) * 100,
  );
});

productSchema.virtual("mainImage").get(function () {
  if (!this.images || this.images.length === 0) return null;
  return this.images.find((img) => img.isMain) || this.images[0];
});

productSchema.virtual("isInStock").get(function () {
  if (this.allowBackorder) return true;
  return this.stock > 0;
});

productSchema.virtual("isLowStock").get(function () {
  return this.stock > 0 && this.stock <= this.lowStockThreshold;
});

productSchema.virtual("reviews", {
  ref: "Review",
  foreignField: "product",
  localField: "_id",
});

// ─── Pre-save Hooks ─────────────────────────────────────────────────────────
productSchema.pre("save", function (next) {
  // Auto-generate slug from name
  if (this.isModified("name") && !this.slug) {
    this.slug =
      this.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim() +
      "-" +
      Date.now().toString(36);
  }

  // Auto-set published date
  if (this.isModified("isPublished") && this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  // Validate compareAtPrice > price
  if (this.compareAtPrice && this.compareAtPrice <= this.price) {
    this.compareAtPrice = null;
  }

  next();
});

// ─── Static Methods ─────────────────────────────────────────────────────────
productSchema.statics.updateRatings = async function (productId) {
  const Review = mongoose.model("Review");
  const stats = await Review.aggregate([
    { $match: { product: productId, isApproved: true } },
    {
      $group: {
        _id: "$product",
        count: { $sum: 1 },
        avg: { $avg: "$rating" },
        dist1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        dist2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
        dist3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
        dist4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
        dist5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
      },
    },
  ]);

  if (stats.length > 0) {
    const { count, avg, dist1, dist2, dist3, dist4, dist5 } = stats[0];
    await this.findByIdAndUpdate(productId, {
      "ratings.average": Math.round(avg * 10) / 10,
      "ratings.count": count,
      "ratings.distribution": {
        1: dist1,
        2: dist2,
        3: dist3,
        4: dist4,
        5: dist5,
      },
    });
  } else {
    await this.findByIdAndUpdate(productId, {
      "ratings.average": 0,
      "ratings.count": 0,
    });
  }
};

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
