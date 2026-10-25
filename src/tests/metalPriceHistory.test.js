import { describe, it, expect, vi } from "vitest";
import { saveMetalPriceSnapshot } from "../services/metalPriceHistory.js";

describe("metal price history service", () => {
  it("skips saving when MongoDB is disconnected", async () => {
    const create = vi.fn();

    await expect(
      saveMetalPriceSnapshot(
        { metal: "gold" },
        {
          MetalPrice: { create },
          isMongoDBConnected: () => false,
        },
      ),
    ).resolves.toEqual({
      saved: false,
      reason: "database_unavailable",
    });

    expect(create).not.toHaveBeenCalled();
  });

  it("saves a snapshot when MongoDB is connected", async () => {
    const create = vi.fn().mockResolvedValue({ _id: "test-id" });

    await expect(
      saveMetalPriceSnapshot(
        { metal: "gold" },
        {
          MetalPrice: { create },
          isMongoDBConnected: () => true,
        },
      ),
    ).resolves.toEqual({ saved: true });

    expect(create).toHaveBeenCalledWith({ metal: "gold" });
  });

  it("handles database write failures without throwing", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new Error("Database write failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      saveMetalPriceSnapshot(
        { metal: "silver" },
        {
          MetalPrice: { create },
          isMongoDBConnected: () => true,
        },
      ),
    ).resolves.toEqual({
      saved: false,
      reason: "persistence_failed",
    });

    expect(create).toHaveBeenCalledWith({ metal: "silver" });
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
