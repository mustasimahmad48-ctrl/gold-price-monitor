
import { describe, it, expect } from "vitest";
import { calculateSilverRates } from "../silverCalculations.js";

describe("calculateSilverRates", () => {
  it("calculates all six silver-unit prices", () => {
    const rates = calculateSilverRates(50, 280);

    expect(rates.pkrPerGram).toBe(450.11);
    expect(rates.pkrPer10Grams).toBe(4501.1);
    expect(rates.pkrPerTola).toBe(5250);
    expect(rates.pkrPerTroyOunce).toBe(14000);
    expect(rates.pkrPerMasha).toBe(437.5);
    expect(rates.pkrPerRatti).toBe(54.69);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, "50", null])(
    "rejects invalid silver prices: %s",
    (price) => {
      expect(() => calculateSilverRates(price, 280)).toThrow();
    }
  );

  it.each([0, -1, NaN, Infinity, -Infinity, "280", null])(
    "rejects invalid exchange rates: %s",
    (rate) => {
      expect(() => calculateSilverRates(50, rate)).toThrow();
    }
  );
});
