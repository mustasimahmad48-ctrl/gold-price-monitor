"use strict";

const MetalPrice = require("../models/MetalPrice");
const { isMongoDBConnected } = require("../config/database");

async function saveMetalPriceSnapshot(
  snapshot,
  dependencies = { MetalPrice, isMongoDBConnected },
) {
  if (!dependencies.isMongoDBConnected()) {
    return { saved: false, reason: "database_unavailable" };
  }

  try {
    await dependencies.MetalPrice.create(snapshot);
    return { saved: true };
  } catch (error) {
    console.error("Unable to save metal price history:", error.message);
    return { saved: false, reason: "persistence_failed" };
  }
}

function parseHistoryQuery(query) {
  const metal = query.metal;
  const from = query.from;
  const to = query.to;
  const limitText = query.limit ?? "20";
  const pageText = query.page ?? "1";

  if (!["gold", "silver"].includes(metal)) {
    return { error: "metal must be either gold or silver." };
  }

  const validDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

  if (from !== undefined && !validDate(from)) {
    return { error: "from must be a valid date in YYYY-MM-DD format." };
  }

  if (to !== undefined && !validDate(to)) {
    return { error: "to must be a valid date in YYYY-MM-DD format." };
  }

  if (from && to && from > to) {
    return { error: "from cannot be later than to." };
  }

  if (!/^\d+$/.test(String(limitText))) {
    return { error: "limit must be an integer between 1 and 100." };
  }

  if (!/^\d+$/.test(String(pageText))) {
    return { error: "page must be a positive integer." };
  }

  const limit = Number(limitText);
  const page = Number(pageText);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return { error: "limit must be an integer between 1 and 100." };
  }

  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) {
    return {
      error: "page must be a positive integer no greater than 1000000.",
    };
  }

  return { metal, from, to, limit, page };
}

async function getMetalPriceHistory(
  options,
  dependencies = { MetalPrice, isMongoDBConnected },
) {
  if (!dependencies.isMongoDBConnected()) {
    return { error: "database_unavailable" };
  }

  const { metal, from, to, limit, page } = options;
  const filter = { metal };

  if (from || to) {
    filter.fetchedAt = {};
    if (from) filter.fetchedAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to)
      filter.fetchedAt.$lt = new Date(
        new Date(`${to}T00:00:00.000Z`).getTime() + 86400000,
      );
  }

  try {
    const [records, total] = await Promise.all([
      dependencies.MetalPrice.find(filter)
        .sort({ fetchedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      dependencies.MetalPrice.countDocuments(filter),
    ]);

    return {
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("Unable to retrieve metal price history:", error.message);
    return { error: "history_query_failed" };
  }
}

module.exports = {
  saveMetalPriceSnapshot,
  parseHistoryQuery,
  getMetalPriceHistory,
};
