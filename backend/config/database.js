"use strict";

const mongoose = require("mongoose");
const logger = require("../utils/logger");

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

const mongooseOptions = {
  // Connection pool
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,

  // Reliability
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  w: "majority",
  readPreference: "primaryPreferred",
};

/**
 * Connects to MongoDB with exponential backoff retry logic.
 */
const connectDatabase = async (retryCount = 0) => {
  try {
    const uri =
      process.env.NODE_ENV === "test"
        ? process.env.MONGODB_URI_TEST
        : process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    await mongoose.connect(uri, mongooseOptions);

    const db = mongoose.connection;

    db.on("connected", () => {
      logger.info(`MongoDB connected: ${mongoose.connection.host}`);
    });

    db.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });

    db.on("disconnected", () => {
      logger.warn("MongoDB disconnected. Attempting reconnect...");
    });

    db.on("reconnected", () => {
      logger.info("MongoDB reconnected");
    });

    // Enable query profiling in development
    if (process.env.NODE_ENV === "development") {
      mongoose.set("debug", (collectionName, method, query, doc) => {
        logger.debug(`Mongoose: ${collectionName}.${method}`, { query, doc });
      });
    }

    return db;
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
      logger.warn(
        `MongoDB connection failed. Retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return connectDatabase(retryCount + 1);
    }

    logger.error("MongoDB connection failed after maximum retries:", err);
    throw err;
  }
};

/**
 * Creates indexes for all collections.
 * Called once on application startup.
 */
const createIndexes = async () => {
  try {
    const models = mongoose.modelNames();
    for (const modelName of models) {
      await mongoose.model(modelName).createIndexes();
      logger.debug(`Indexes created for model: ${modelName}`);
    }
    logger.info("All database indexes created successfully");
  } catch (err) {
    logger.error("Error creating indexes:", err);
    throw err;
  }
};

module.exports = { connectDatabase, createIndexes };
