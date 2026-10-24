
"use strict";

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const GRAMS_PER_TOLA = 11.6638038;
const GRAMS_PER_MASHA = GRAMS_PER_TOLA / 12;
const GRAMS_PER_RATTI = GRAMS_PER_TOLA / 96;

function requirePositiveFinite(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function calculateGoldRates(usdPerTroyOunce, usdToPkr) {
  requirePositiveFinite(usdPerTroyOunce, "Gold price");
  requirePositiveFinite(usdToPkr, "USD/PKR rate");

  const pkrPerGram =
    (usdPerTroyOunce / GRAMS_PER_TROY_OUNCE) * usdToPkr;

  const pkrPerTola = pkrPerGram * GRAMS_PER_TOLA;

  return {
    pkrPerGram: roundMoney(pkrPerGram),
    pkrPer10Grams: roundMoney(pkrPerGram * 10),
    pkrPerTola: roundMoney(pkrPerTola),
    pkrPerTroyOunce: roundMoney(
      usdPerTroyOunce * usdToPkr
    ),
    pkrPerMasha: roundMoney(
      pkrPerGram * GRAMS_PER_MASHA
    ),
    pkrPerRatti: roundMoney(
      pkrPerGram * GRAMS_PER_RATTI
    ),
  };
}

module.exports = {
  calculateGoldRates,
  GRAMS_PER_TROY_OUNCE,
  GRAMS_PER_TOLA,
  GRAMS_PER_MASHA,
  GRAMS_PER_RATTI,
};
