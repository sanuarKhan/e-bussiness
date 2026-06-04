"use strict";

const { validationResult } = require("express-validator");
const { ValidationError } = require("../utils/errors");

/**
 * Middleware to check validation results from express-validator chains.
 * Must be placed after validation chains in the route.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));
    throw new ValidationError("Validation failed", details);
  }
  next();
};

module.exports = { validate };
