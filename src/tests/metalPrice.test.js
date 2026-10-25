import { describe, it, expect } from "vitest";
import MetalPrice from "../models/MetalPrice.js";

const validPrice = {
  metal: "gold",
  source: "api.gold-api.com",
  quoteCurrency: "USD",
  quoteUnit: "troy_ounce",
  quotePrice: 2650,
  fxRate: 280,
  fxSource: "api.frankfurter.dev",
  fxDate: "2026-10-23",
  calculatedPricesPKR: {
    perGram: 23870,
    perTola: 278300,
    per10Grams: 238700,
    perTroyOunce: 822200,
    perMasha: 1989,
    perRatti: 497,
  },
  quoteTimestamp: new Date("2026-10-23T10:00:00.000Z"),
  fetchedAt: new Date("2026-10-23T10:01:00.000Z"),
};

describe("MetalPrice model", () => {
  it("accepts a valid gold snapshot", async () => {
    await expect(
      new MetalPrice(validPrice).validate(),
    ).resolves.toBeUndefined();
  });

  it("accepts a valid silver snapshot", async () => {
    const document = new MetalPrice({ ...validPrice, metal: "silver" });
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it("rejects an unsupported metal", async () => {
    const document = new MetalPrice({ ...validPrice, metal: "platinum" });
    await expect(document.validate()).rejects.toThrow();
  });

  it("rejects a negative quote price", async () => {
    const document = new MetalPrice({ ...validPrice, quotePrice: -1 });
    await expect(document.validate()).rejects.toThrow();
  });

  it("rejects a non-positive FX rate", async () => {
    const document = new MetalPrice({ ...validPrice, fxRate: 0 });
    await expect(document.validate()).rejects.toThrow();
  });

  it("rejects an invalid quote currency", async () => {
    const document = new MetalPrice({
      ...validPrice,
      quoteCurrency: "PKR",
    });
    await expect(document.validate()).rejects.toThrow();
  });

  it("requires calculated prices and source metadata", async () => {
    const document = new MetalPrice({
      metal: "gold",
      source: "api.gold-api.com",
    });
    await expect(document.validate()).rejects.toThrow();
  });

  it("rejects an invalid FX date", async () => {
    const document = new MetalPrice({ ...validPrice, fxDate: "23-10-2026" });
    await expect(document.validate()).rejects.toThrow();
  });
});
