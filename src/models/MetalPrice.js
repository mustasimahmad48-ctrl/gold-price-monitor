"use strict";

const mongoose = require("mongoose");

const finiteNonNegative = {
  validator: (value) => Number.isFinite(value) && value >= 0,
  message: "Value must be a finite, non-negative number.",
};

const metalPriceSchema = new mongoose.Schema(
  {
    metal: {
      type: String,
      required: true,
      enum: ["gold", "silver"],
    },
    source: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    quoteCurrency: {
      type: String,
      required: true,
      enum: ["USD"],
    },
    quoteUnit: {
      type: String,
      required: true,
      enum: ["troy_ounce"],
    },
    quotePrice: {
      type: Number,
      required: true,
      validate: finiteNonNegative,
    },
    fxRate: {
      type: Number,
      required: true,
      validate: {
        validator: (value) => Number.isFinite(value) && value > 0,
        message: "FX rate must be a finite positive number.",
      },
    },
    fxSource: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    fxDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    calculatedPricesPKR: {
      perGram: { type: Number, required: true, validate: finiteNonNegative },
      perTola: { type: Number, required: true, validate: finiteNonNegative },
      per10Grams: { type: Number, required: true, validate: finiteNonNegative },
      perTroyOunce: {
        type: Number,
        required: true,
        validate: finiteNonNegative,
      },
      perMasha: { type: Number, required: true, validate: finiteNonNegative },
      perRatti: { type: Number, required: true, validate: finiteNonNegative },
    },
    quoteTimestamp: {
      type: Date,
      required: true,
    },
    fetchedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

metalPriceSchema.index({ metal: 1, fetchedAt: -1 });

module.exports =
  mongoose.models.MetalPrice || mongoose.model("MetalPrice", metalPriceSchema);
