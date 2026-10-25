"use strict";

const { z } = require("zod");

function readPositiveInteger(name, fallback) {
  const value = process.env[name] ?? String(fallback);

  z.string()
    .regex(/^[1-9]\d*$/, {
      message: `${name} must be a positive integer.`,
    })
    .parse(value);

  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    throw new Error(`${name} is outside the supported range.`);
  }

  return number;
}

function readUrl(name, fallback) {
  const value = process.env[name] ?? fallback;

  // Zod validates the input type; URL parsing preserves existing
  // protocol validation and URL normalization behavior.
  z.string().min(1).parse(value);

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }

  return parsed.toString();
}

const env = Object.freeze({
  PORT: readPositiveInteger("PORT", 3000),
  REQUEST_TIMEOUT_MS: readPositiveInteger("REQUEST_TIMEOUT_MS", 10000),
  MAX_GOLD_AGE_MS: readPositiveInteger("MAX_GOLD_AGE_MS", 300000),
  CACHE_TTL_MS: readPositiveInteger("CACHE_TTL_MS", 30000),

  GOLD_API_URL: readUrl(
    "GOLD_API_URL",
    "https://api.gold-api.com/price/XAU/USD",
  ),

  SILVER_API_URL: readUrl(
    "SILVER_API_URL",
    "https://api.gold-api.com/price/XAG",
  ),

  CURRENCY_API_URL: readUrl(
    "CURRENCY_API_URL",
    "https://api.frankfurter.dev/v2/rate/usd/pkr",
  ),

  MONGODB_URI: process.env.MONGODB_URI?.trim() || undefined,
});

if (env.MONGODB_URI !== undefined) {
  z.string().min(1, "MONGODB_URI cannot be empty.").parse(env.MONGODB_URI);

  if (!/^mongodb(?:\+srv)?:\/\//i.test(env.MONGODB_URI)) {
    throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
  }
}

module.exports = env;
