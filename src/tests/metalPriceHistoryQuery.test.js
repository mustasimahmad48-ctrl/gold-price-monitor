import { describe, it, expect, vi } from "vitest";
import {
  parseHistoryQuery,
  getMetalPriceHistory,
} from "../services/metalPriceHistory.js";

describe("metal price history query", () => {
  it("accepts valid filters and defaults pagination", () => {
    expect(parseHistoryQuery({ metal: "gold" })).toEqual({
      metal: "gold",
      from: undefined,
      to: undefined,
      limit: 20,
      page: 1,
    });
  });

  it("rejects invalid metal values", () => {
    expect(parseHistoryQuery({ metal: "platinum" }).error).toMatch(/metal/);
  });

  it("rejects invalid calendar dates", () => {
    expect(
      parseHistoryQuery({ metal: "gold", from: "2026-02-30" }).error,
    ).toMatch(/valid date/);
  });

  it("rejects reversed date ranges", () => {
    expect(
      parseHistoryQuery({
        metal: "gold",
        from: "2026-10-20",
        to: "2026-10-01",
      }).error,
    ).toMatch(/later than/);
  });

  it("rejects limits over 100", () => {
    expect(parseHistoryQuery({ metal: "gold", limit: "101" }).error).toMatch(
      /limit/,
    );
  });

  it("returns an unavailable result if the database is disconnected", async () => {
    const result = await getMetalPriceHistory(
      { metal: "gold", limit: 20, page: 1 },
      {
        MetalPrice: {},
        isMongoDBConnected: () => false,
      },
    );

    expect(result).toEqual({ error: "database_unavailable" });
  });

  it("returns paginated records from the database", async () => {
    const records = [{ metal: "gold" }];
    const query = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(records),
    };
    const Model = {
      find: vi.fn().mockReturnValue(query),
      countDocuments: vi.fn().mockResolvedValue(1),
    };

    const result = await getMetalPriceHistory(
      { metal: "gold", limit: 20, page: 1 },
      { MetalPrice: Model, isMongoDBConnected: () => true },
    );

    expect(Model.find).toHaveBeenCalledWith({ metal: "gold" });
    expect(result.data).toEqual(records);
    expect(result.pagination.total).toBe(1);
    expect(query.limit).toHaveBeenCalledWith(20);
  });
});
