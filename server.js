
"use strict";

require("dotenv").config();

const express = require("express");
const { calculateGoldRates } = require("./src/goldCalculations");
const { calculateSilverRates } = require("./src/silverCalculations");

// ==========================================
// CONFIGURATION VALIDATION
// ==========================================

function readPositiveInteger(name, fallback) {
  const value = process.env[name] ?? String(fallback);

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number)) {
    throw new Error(`${name} is outside the supported range.`);
  }

  return number;
}

function readUrl(name, fallback) {
  const value = process.env[name] ?? fallback;
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

const PORT = readPositiveInteger("PORT", 3000);

const REQUEST_TIMEOUT_MS = readPositiveInteger(
  "REQUEST_TIMEOUT_MS",
  10000
);

const MAX_GOLD_AGE_MS = readPositiveInteger(
  "MAX_GOLD_AGE_MS",
  300000
);

const CACHE_TTL_MS = readPositiveInteger(
  "CACHE_TTL_MS",
  30000
);

const GOLD_API_URL = readUrl(
  "GOLD_API_URL",
  "https://api.gold-api.com/price/XAU/USD"
);

const SILVER_API_URL = readUrl(
  "SILVER_API_URL",
  "https://api.gold-api.com/price/XAG"
);

const CURRENCY_API_URL = readUrl(
  "CURRENCY_API_URL",
  "https://api.frankfurter.dev/v2/rate/usd/pkr"
);

// ==========================================
// FETCH JSON WITH TIMEOUT
// ==========================================

async function fetchJson(url, label, fetchImpl) {
  let response;

  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError"
    ) {
      throw new Error(`${label} request timed out.`);
    }

    throw new Error(`${label} network request failed.`);
  }

  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

// ==========================================
// SHARED METAL PRICE VALIDATION
// ==========================================

async function getMetalPrice(fetchImpl, config) {
  const { url, label, symbol, fallbackName } = config;
  const data = await fetchJson(url, label, fetchImpl);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${label} returned an invalid response.`);
  }

  if (
    typeof data.price !== "number" ||
    !Number.isFinite(data.price) ||
    data.price <= 0
  ) {
    throw new Error(`${label} returned an invalid price.`);
  }

  if (data.currency !== "USD" || data.symbol !== symbol) {
    throw new Error(
      `${label} returned an unexpected currency or symbol.`
    );
  }

  if (!data.updatedAt) {
    throw new Error(`${label} did not provide a timestamp.`);
  }

  const updatedAtMs = Date.parse(data.updatedAt);

  if (!Number.isFinite(updatedAtMs)) {
    throw new Error(`${label} returned an invalid timestamp.`);
  }

  const ageMs = Date.now() - updatedAtMs;

  if (ageMs < -60000) {
    throw new Error(`${label} timestamp is too far in the future.`);
  }

  if (ageMs > MAX_GOLD_AGE_MS) {
    throw new Error(
      `${label} quote is stale: ${Math.floor(ageMs / 1000)} seconds old.`
    );
  }

  return {
    name: data.name ?? fallbackName,
    symbol: data.symbol,
    currency: data.currency,
    pricePerTroyOunce: data.price,
    updatedAt: data.updatedAt,
    ageMs: Math.max(0, ageMs),
    ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
  };
}

// ==========================================
// GOLD PRICE
// ==========================================

async function getGoldPrice(fetchImpl) {
  return getMetalPrice(fetchImpl, {
    url: GOLD_API_URL,
    label: "Gold API",
    symbol: "XAU",
    fallbackName: "Gold",
  });
}

// ==========================================
// SILVER PRICE
// ==========================================

async function getSilverPrice(fetchImpl) {
  return getMetalPrice(fetchImpl, {
    url: SILVER_API_URL,
    label: "Silver API",
    symbol: "XAG",
    fallbackName: "Silver",
  });
}

// ==========================================
// USD/PKR RATE
// ==========================================

function parseIsoCalendarDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return NaN;
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(timestamp)) {
    return NaN;
  }

  if (new Date(timestamp).toISOString().slice(0, 10) !== value) {
    return NaN;
  }

  return timestamp;
}

async function getUsdToPkrRate(fetchImpl) {
  const data = await fetchJson(
    CURRENCY_API_URL,
    "Currency API",
    fetchImpl
  );

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid USD/PKR exchange-rate response.");
  }

  if (
    data.base !== "USD" ||
    data.quote !== "PKR" ||
    typeof data.rate !== "number" ||
    !Number.isFinite(data.rate) ||
    data.rate <= 0
  ) {
    throw new Error("Invalid USD/PKR exchange-rate response.");
  }

  const rateDateMs = parseIsoCalendarDate(data.date);

  if (!Number.isFinite(rateDateMs)) {
    throw new Error("Currency API returned an invalid date.");
  }

  const ageMs = Date.now() - rateDateMs;

  if (ageMs < -86400000) {
    throw new Error("Currency API date is in the future.");
  }

  if (ageMs > 3 * 86400000) {
    throw new Error(`USD/PKR rate is too old: ${data.date}.`);
  }

  return { rate: data.rate, date: data.date };
}

// ==========================================
// CREATE EXPRESS APP
// ==========================================

function createApp({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A valid fetch implementation is required.");
  }

  const app = express();

  // Independent caches for gold and silver.
  let cachedGoldResult = null;
  let inFlightGoldRequest = null;

  let cachedSilverResult = null;
  let inFlightSilverRequest = null;

  app.use(express.json());

  // Handle malformed and oversized JSON request bodies.
  app.use((error, req, res, next) => {
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({
        status: "error",
        message: "Invalid JSON request body.",
      });
    }

    if (error) {
      return res.status(error.status || 500).json({
        status: "error",
        message:
          error.status === 413
            ? "Request body is too large."
            : "Request could not be processed.",
      });
    }

    next();
  });

  // ----------------------------------------
  // LOAD GOLD RATES
  // ----------------------------------------

  async function loadGoldRates() {
    const [gold, fx] = await Promise.all([
      getGoldPrice(fetchImpl),
      getUsdToPkrRate(fetchImpl),
    ]);

    const rates = calculateGoldRates(
      gold.pricePerTroyOunce,
      fx.rate
    );

    const body = {
      status: "success",
      data: {
        metal: gold.name,
        symbol: gold.symbol,
        currency: "PKR",
        goldPriceUSDPerTroyOunce: gold.pricePerTroyOunce,
        usdToPkr: fx.rate,
        exchangeRateDate: fx.date,
        goldQuoteTimestamp: gold.updatedAt,
        goldQuoteAgeSeconds: gold.ageSeconds,
        goldPricePKRPerGram: rates.pkrPerGram,
        goldPricePKRPerTola: rates.pkrPerTola,
        goldPricePKRPer10Grams: rates.pkrPer10Grams,
        goldPricePKRPerTroyOunce: rates.pkrPerTroyOunce,
        goldPricePKRPerMasha: rates.pkrPerMasha,
        goldPricePKRPerRatti: rates.pkrPerRatti,
      },
      notes: [
        "Indicative international spot conversion for pure gold.",
        "Not a verified Pakistani Sarafa market price.",
        "USD/PKR is a daily reference rate, not a live open-market quote.",
      ],
    };

    const remainingAge = Math.max(
      0,
      MAX_GOLD_AGE_MS - gold.ageMs
    );

    return {
      body,
      expiresAt: Date.now() + Math.min(CACHE_TTL_MS, remainingAge),
    };
  }

  // ----------------------------------------
  // LOAD SILVER RATES
  // ----------------------------------------

  async function loadSilverRates() {
    const [silver, fx] = await Promise.all([
      getSilverPrice(fetchImpl),
      getUsdToPkrRate(fetchImpl),
    ]);

    const rates = calculateSilverRates(
      silver.pricePerTroyOunce,
      fx.rate
    );

    const body = {
      status: "success",
      data: {
        metal: silver.name,
        symbol: silver.symbol,
        currency: "PKR",
        silverPriceUSDPerTroyOunce: silver.pricePerTroyOunce,
        usdToPkr: fx.rate,
        exchangeRateDate: fx.date,
        silverQuoteTimestamp: silver.updatedAt,
        silverQuoteAgeSeconds: silver.ageSeconds,
        silverPricePKRPerGram: rates.pkrPerGram,
        silverPricePKRPer10Grams: rates.pkrPer10Grams,
        silverPricePKRPerTola: rates.pkrPerTola,
        silverPricePKRPerTroyOunce: rates.pkrPerTroyOunce,
        silverPricePKRPerMasha: rates.pkrPerMasha,
        silverPricePKRPerRatti: rates.pkrPerRatti,
      },
      notes: [
        "Indicative international silver spot conversion.",
        "Not a verified Pakistani Sarafa market price.",
        "USD/PKR is a daily reference rate, not a live open-market quote.",
      ],
    };

    const remainingAge = Math.max(
      0,
      MAX_GOLD_AGE_MS - silver.ageMs
    );

    return {
      body,
      expiresAt: Date.now() + Math.min(CACHE_TTL_MS, remainingAge),
    };
  }

  // ----------------------------------------
  // GENERIC CACHE + REQUEST COALESCING
  // ----------------------------------------

  async function getCachedRates({
    getCached,
    setCached,
    getInFlight,
    setInFlight,
    loadRates,
  }) {
    const cached = getCached();

    if (cached && Date.now() < cached.expiresAt) {
      return cached.body;
    }

    setCached(null);

    const inFlight = getInFlight();

    if (inFlight) {
      return inFlight;
    }

    const pendingRequest = (async () => {
      const result = await loadRates();

      if (result.expiresAt > Date.now()) {
        setCached(result);
      }

      return result.body;
    })();

    setInFlight(pendingRequest);

    try {
      return await pendingRequest;
    } finally {
      if (getInFlight() === pendingRequest) {
        setInFlight(null);
      }
    }
  }

  function getCachedGoldRates() {
    return getCachedRates({
      getCached: () => cachedGoldResult,
      setCached: (value) => {
        cachedGoldResult = value;
      },
      getInFlight: () => inFlightGoldRequest,
      setInFlight: (value) => {
        inFlightGoldRequest = value;
      },
      loadRates: loadGoldRates,
    });
  }

  function getCachedSilverRates() {
    return getCachedRates({
      getCached: () => cachedSilverResult,
      setCached: (value) => {
        cachedSilverResult = value;
      },
      getInFlight: () => inFlightSilverRequest,
      setInFlight: (value) => {
        inFlightSilverRequest = value;
      },
      loadRates: loadSilverRates,
    });
  }

  // ----------------------------------------
  // HOME
  // ----------------------------------------

  app.get("/", (req, res) => {
    res.json({
      message: "Gold Price Monitor API is running!",
      status: "success",
    });
  });

  // ----------------------------------------
  // HEALTH CHECK
  // ----------------------------------------

  app.get("/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });
  });

  // ----------------------------------------
  // GOLD RATES
  // ----------------------------------------

  app.get("/api/gold", async (req, res) => {
    try {
      const result = await getCachedGoldRates();
      res.json(result);
    } catch (error) {
      console.error("Gold endpoint failed:", error.message);

      res.status(502).json({
        status: "error",
        message: "Unable to retrieve valid gold rates.",
        detail: error.message,
      });
    }
  });

  // ----------------------------------------
  // SILVER RATES
  // ----------------------------------------

  app.get("/api/silver", async (req, res) => {
    try {
      const result = await getCachedSilverRates();
      res.json(result);
    } catch (error) {
      console.error("Silver endpoint failed:", error.message);

      res.status(502).json({
        status: "error",
        message: "Unable to retrieve valid silver rates.",
        detail: error.message,
      });
    }
  });

  // ----------------------------------------
  // UNKNOWN ROUTES
  // ----------------------------------------

  app.use((req, res) => {
    res.status(404).json({
      status: "error",
      message: "Endpoint not found.",
    });
  });

  return app;
}

// Keep the existing app import working for server.test.js.
const app = createApp();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `Gold and Silver Price Monitor API running at http://localhost:${PORT}`
    );
    console.log(`Gold rates: http://localhost:${PORT}/api/gold`);
    console.log(`Silver rates: http://localhost:${PORT}/api/silver`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Cache TTL: ${CACHE_TTL_MS} ms`);
  });
}

module.exports = app;
module.exports.createApp = createApp;
