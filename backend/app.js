"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const xssClean = require("xss-clean");
const hpp = require("hpp");
const morgan = require("morgan");
const path = require("path");

const {
  rateLimiter,
  authLimiter,
  paymentLimiter,
} = require("./middleware/rateLimiter");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { requestLogger } = require("./middleware/requestLogger");
const logger = require("./utils/logger");

// Route imports
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const productRoutes = require("./routes/product.routes");
const categoryRoutes = require("./routes/category.routes");
const cartRoutes = require("./routes/cart.routes");
const wishlistRoutes = require("./routes/wishlist.routes");
const orderRoutes = require("./routes/order.routes");
const paymentRoutes = require("./routes/payment.routes");
const reviewRoutes = require("./routes/review.routes");
const adminRoutes = require("./routes/admin.routes");
const vendorRoutes = require("./routes/vendor.routes");
const uploadRoutes = require("./routes/upload.routes");
const analyticsRoutes = require("./routes/analytics.routes");

const app = express();

const API_PREFIX = `/api/${process.env.API_VERSION || "v1"}`;

// ─── Trust Proxy (for Cloudflare/Nginx) ────────────────────────────────────
app.set("trust proxy", 1);

// ─── Security Headers ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'nonce-{NONCE}'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// ─── CORS ───────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
      .split(",")
      .map((o) => o.trim());

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy violation: ${origin} is not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-CSRF-Token",
  ],
  exposedHeaders: ["X-Total-Count", "X-Page", "X-Per-Page"],
  maxAge: 86400, // 24 hours preflight cache
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ─── Compression ────────────────────────────────────────────────────────────
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
    threshold: 1024, // Only compress > 1KB
  }),
);

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" })); // Prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser(process.env.SESSION_SECRET));

// ─── Request Logging ────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
app.use(requestLogger);

// ─── Data Sanitization ──────────────────────────────────────────────────────
// Against NoSQL injection attacks
app.use(mongoSanitize({ replaceWith: "_" }));

// Against XSS attacks
app.use(xssClean());

// Against HTTP Parameter Pollution
app.use(
  hpp({
    whitelist: [
      "price",
      "rating",
      "category",
      "brand",
      "size",
      "color",
      "sort",
      "fields",
    ],
  }),
);

// ─── Global Rate Limiting ───────────────────────────────────────────────────
app.use(`${API_PREFIX}/`, rateLimiter);

// ─── Health Check ───────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
  });
});

app.get(`${API_PREFIX}/health`, (req, res) => {
  res.status(200).json({
    status: "healthy",
    api: `${process.env.API_VERSION || "v1"}`,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use(`${API_PREFIX}/auth`, authLimiter, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/products`, productRoutes);
app.use(`${API_PREFIX}/categories`, categoryRoutes);
app.use(`${API_PREFIX}/cart`, cartRoutes);
app.use(`${API_PREFIX}/wishlist`, wishlistRoutes);
app.use(`${API_PREFIX}/orders`, orderRoutes);
app.use(`${API_PREFIX}/payments`, paymentLimiter, paymentRoutes);
app.use(`${API_PREFIX}/reviews`, reviewRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/vendor`, vendorRoutes);
app.use(`${API_PREFIX}/upload`, uploadRoutes);
app.use(`${API_PREFIX}/analytics`, analyticsRoutes);

// ─── Webhook Routes (raw body needed) ──────────────────────────────────────
app.use(`${API_PREFIX}/webhooks`, express.raw({ type: "application/json" }));

// ─── Static Files ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const frontendBuild = path.join(__dirname, "../../frontend/dist");
  app.use(express.static(frontendBuild, { maxAge: "1y", etag: true }));

  // Serve React app for all non-API routes
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendBuild, "index.html"));
  });
}

// ─── Error Handling ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
