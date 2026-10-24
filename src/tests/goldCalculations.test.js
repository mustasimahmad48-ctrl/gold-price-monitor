
import { describe, it, expect } from "vitest";
import { calculateGoldRates } from "../goldCalculations.js";

describe("calculateGoldRates", () => {
  describe("valid calculations", () => {
    it("calculates the price per gram and tola", () => {
      const result = calculateGoldRates(4005.899902, 277.33);

      expect(result.pkrPerGram).toBe(35718.07);
      expect(result.pkrPerTola).toBe(416608.58);
    });

    it("returns finite numeric prices rounded to two decimal places", () => {
      const result = calculateGoldRates(4000, 280);

      expect(typeof result.pkrPerGram).toBe("number");
      expect(typeof result.pkrPerTola).toBe("number");
      expect(Number.isFinite(result.pkrPerGram)).toBe(true);
      expect(Number.isFinite(result.pkrPerTola)).toBe(true);

      expect(result.pkrPerGram).toBe(
        Number(result.pkrPerGram.toFixed(2))
      );
      expect(result.pkrPerTola).toBe(
        Number(result.pkrPerTola.toFixed(2))
      );
    });

    it("calculates the tola price correctly", () => {
      const result = calculateGoldRates(4000, 280);

      const expectedTola = Number(
        (((4000 / 31.1034768) * 280) * 11.6638038).toFixed(2)
      );

      expect(result.pkrPerTola).toBe(expectedTola);
    });

    it("increases prices when the gold price increases", () => {
      const lower = calculateGoldRates(3000, 280);
      const higher = calculateGoldRates(4000, 280);

      expect(higher.pkrPerGram).toBeGreaterThan(lower.pkrPerGram);
      expect(higher.pkrPerTola).toBeGreaterThan(lower.pkrPerTola);
    });

    it("increases prices when the exchange rate increases", () => {
      const lower = calculateGoldRates(4000, 270);
      const higher = calculateGoldRates(4000, 280);

      expect(higher.pkrPerGram).toBeGreaterThan(lower.pkrPerGram);
      expect(higher.pkrPerTola).toBeGreaterThan(lower.pkrPerTola);
    });
  });

  describe("invalid gold prices", () => {
    it.each([
      0,
      -1,
      NaN,
      Infinity,
      -Infinity,
      "4000",
      null,
      undefined,
    ])("rejects invalid gold price: %s", (goldPrice) => {
      expect(() => calculateGoldRates(goldPrice, 280)).toThrow();
    });
  });

  describe("invalid exchange rates", () => {
    it.each([
      0,
      -1,
      NaN,
      Infinity,
      -Infinity,
      "280",
      null,
      undefined,
    ])("rejects invalid exchange rate: %s", (exchangeRate) => {
      expect(() => calculateGoldRates(4000, exchangeRate)).toThrow();
    });
  });
});

describe("Additional gold-unit conversions", () => {
  it("calculates the 10-gram price from the unrounded gram price", () => {
    const rates = calculateGoldRates(4000, 280);
    const expected = ((4000 / 31.1034768) * 280) * 10;

    expect(rates.pkrPer10Grams).toBe(Number(expected.toFixed(2)));
  });

  it("calculates the troy-ounce price", () => {
    const rates = calculateGoldRates(4000, 280);

    expect(rates.pkrPerTroyOunce).toBe(1120000);
  });

  it("calculates the masha price", () => {
    const rates = calculateGoldRates(4000, 280);
    const expected =
      ((4000 / 31.1034768) * 280) * (11.6638038 / 12);

    expect(rates.pkrPerMasha).toBe(Number(expected.toFixed(2)));
  });

  it("calculates the ratti price", () => {
    const rates = calculateGoldRates(4000, 280);
    const expected =
      ((4000 / 31.1034768) * 280) * (11.6638038 / 96);

    expect(rates.pkrPerRatti).toBe(Number(expected.toFixed(2)));
  });

  it("returns all six unit prices as finite positive numbers", () => {
    const rates = calculateGoldRates(4000, 280);

    expect(Object.keys(rates)).toEqual([
      "pkrPerGram",
      "pkrPer10Grams",
      "pkrPerTola",
      "pkrPerTroyOunce",
      "pkrPerMasha",
      "pkrPerRatti",
    ]);

    for (const price of Object.values(rates)) {
      expect(Number.isFinite(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
    }
  });
});
