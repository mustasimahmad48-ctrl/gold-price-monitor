
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const { createApp } = require("../../server");

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function validGoldData(overrides = {}) {
  return {
    name: "Gold",
    symbol: "XAU",
    currency: "USD",
    price: 4000,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function validSilverData(overrides = {}) {
  return {
    name: "Silver",
    symbol: "XAG",
    currency: "USD",
    price: 32,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function validFxData(overrides = {}) {
  return {
    base: "USD",
    quote: "PKR",
    rate: 280,
    date: new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}

function createMockFetch(goldResponse, fxResponse) {
  return vi
    .fn()
    .mockResolvedValueOnce(goldResponse)
    .mockResolvedValueOnce(fxResponse);
}

describe("Express API routes", () => {
  it("GET / returns the API running message", async () => {
    const app = createApp();
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe(
      "Gold Price Monitor API is running!"
    );
  });

  it("GET /health returns OK and a timestamp", async () => {
    const app = createApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("OK");
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });

  it("returns 404 for an unknown endpoint", async () => {
    const app = createApp();
    const response = await request(app).get("/this-route-does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Endpoint not found.");
  });

  it("rejects an invalid fetch implementation", () => {
    expect(() => createApp({ fetchImpl: null })).toThrow(
      "A valid fetch implementation is required."
    );
  });

  it("returns 400 for malformed JSON request bodies", async () => {
    const response = await request(createApp())
      .post("/")
      .set("Content-Type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Invalid JSON request body.");
  });

  it("returns 413 for oversized JSON request bodies", async () => {
    const largeBody = JSON.stringify({ data: "x".repeat(110000) });

    const response = await request(createApp())
      .post("/")
      .set("Content-Type", "application/json")
      .send(largeBody);

    expect(response.status).toBe(413);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Request body is too large.");
  });
});

describe("GET /api/gold", () => {
  it("returns calculated gold prices when both APIs succeed", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData())
    );

    const app = createApp({ fetchImpl });
    const response = await request(app).get("/api/gold");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.metal).toBe("Gold");
    expect(response.body.data.symbol).toBe("XAU");
    expect(response.body.data.currency).toBe("PKR");
    expect(response.body.data.usdToPkr).toBe(280);
    expect(response.body.data.goldPricePKRPerGram).toBeGreaterThan(0);
    expect(response.body.data.goldPricePKRPerTola).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when the gold API returns an HTTP error", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse({ error: "Service unavailable" }, 503),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
    expect(response.body.detail).toContain("Gold API returned HTTP 503.");
  });

  it("returns 502 when the currency API returns an HTTP error", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse({ error: "Service unavailable" }, 503)
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
    expect(response.body.detail).toContain(
      "Currency API returned HTTP 503."
    );
  });

  it("returns 502 when the gold API network request fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network connection failed"))
      .mockResolvedValueOnce(jsonResponse(validFxData()));

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects an invalid gold price", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData({ price: -1 })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects a zero exchange rate", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData({ rate: 0 }))
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects an incorrect currency pair", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData({ base: "EUR" }))
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects an invalid exchange-rate date", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData({ date: "not-a-date" }))
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects an impossible calendar date", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData({ date: "2026-02-30" }))
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects an exchange-rate date too far in the future", async () => {
    const futureDate = new Date(Date.now() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);

    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData({ date: futureDate }))
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects an exchange-rate date older than three days", async () => {
    const oldDate = new Date(Date.now() - 5 * 86400000)
      .toISOString()
      .slice(0, 10);

    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData({ date: oldDate }))
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects a gold quote in the wrong currency", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData({ currency: "EUR" })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects a gold quote with a missing timestamp", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData({ updatedAt: undefined })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.detail).toContain("timestamp");
  });

  it("rejects a gold quote with an invalid timestamp", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData({ updatedAt: "not-a-date" })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.detail).toContain("timestamp");
  });

  it("rejects a stale gold quote", async () => {
    const staleTimestamp = new Date(
      Date.now() - 10 * 60 * 1000
    ).toISOString();

    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData({ updatedAt: staleTimestamp })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("returns 502 when the gold API returns malformed JSON", async () => {
    const malformedResponse = {
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Invalid JSON");
      },
    };

    const fetchImpl = createMockFetch(
      malformedResponse,
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("calculates the expected gram and tola prices accurately", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData({ price: 4000 })),
      jsonResponse(validFxData({ rate: 280 }))
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    const expectedPerGram = Number(
      ((4000 / 31.1034768) * 280).toFixed(2)
    );

    const expectedPerTola = Number(
      (((4000 / 31.1034768) * 280) * 11.6638038).toFixed(2)
    );

    expect(response.status).toBe(200);
    expect(response.body.data.goldPricePKRPerGram).toBe(expectedPerGram);
    expect(response.body.data.goldPricePKRPerTola).toBe(expectedPerTola);
  });

  it("rejects a gold quote dated too far in the future", async () => {
    const futureTimestamp = new Date(
      Date.now() + 5 * 60 * 1000
    ).toISOString();

    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData({ updatedAt: futureTimestamp })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });
});

describe("Gold rate caching", () => {
  it("reuses cached rates for repeated requests", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse(validFxData())
    );

    const app = createApp({ fetchImpl });

    const first = await request(app).get("/api/gold");
    const second = await request(app).get("/api/gold");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second.body.data).toEqual(first.body.data);
  });

  it("shares one in-flight request between concurrent callers", async () => {
    let releaseGoldRequest;
    let markGoldRequestStarted;

    const goldStarted = new Promise((resolve) => {
      markGoldRequestStarted = resolve;
    });

    const goldResponsePromise = new Promise((resolve) => {
      releaseGoldRequest = resolve;
    });

    const fetchImpl = vi.fn((url) => {
      if (String(url).includes("gold-api.com")) {
        markGoldRequestStarted();
        return goldResponsePromise;
      }

      return Promise.resolve(jsonResponse(validFxData()));
    });

    const app = createApp({ fetchImpl });

    const firstRequest = request(app).get("/api/gold").then((response) => response);

    await goldStarted;

    const secondRequest = request(app).get("/api/gold").then((response) => response);

    // Let the second request reach the in-flight cache check.
    await new Promise((resolve) => setTimeout(resolve, 50));

    releaseGoldRequest(jsonResponse(validGoldData()));

    const [first, second] = await Promise.all([
      firstRequest,
      secondRequest,
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second.body.data).toEqual(first.body.data);
  });

  it("does not cache failed provider requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse(validFxData()))
      .mockResolvedValueOnce(jsonResponse(validGoldData()))
      .mockResolvedValueOnce(jsonResponse(validFxData()));

    const app = createApp({ fetchImpl });

    const first = await request(app).get("/api/gold");
    const second = await request(app).get("/api/gold");

    expect(first.status).toBe(502);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("GET /api/silver", () => {
  it("returns calculated silver prices when both APIs succeed", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validSilverData()),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/silver");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.metal).toBe("Silver");
    expect(response.body.data.symbol).toBe("XAG");
    expect(response.body.data.currency).toBe("PKR");
    expect(response.body.data.usdToPkr).toBe(280);
    expect(response.body.data.silverPricePKRPerGram).toBeGreaterThan(0);
    expect(response.body.data.silverPricePKRPer10Grams).toBeGreaterThan(0);
    expect(response.body.data.silverPricePKRPerTola).toBeGreaterThan(0);
    expect(response.body.data.silverPricePKRPerTroyOunce).toBe(8960);
    expect(response.body.data.silverPricePKRPerMasha).toBeGreaterThan(0);
    expect(response.body.data.silverPricePKRPerRatti).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when the silver API returns an HTTP error", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse({ error: "Service unavailable" }, 503),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/silver");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects an invalid silver price", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validSilverData({ price: -1 })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/silver");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects a silver quote in the wrong currency", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validSilverData({ currency: "EUR" })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/silver");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });

  it("rejects a silver quote with a missing timestamp", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validSilverData({ updatedAt: undefined })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/silver");

    expect(response.status).toBe(502);
    expect(response.body.detail).toContain("timestamp");
  });

  it("rejects a silver quote with an invalid timestamp", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validSilverData({ updatedAt: "not-a-date" })),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/silver");

    expect(response.status).toBe(502);
    expect(response.body.detail).toContain("timestamp");
  });

  it("returns 502 when the currency API fails", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validSilverData()),
      jsonResponse({ error: "Service unavailable" }, 503)
    );

    const response = await request(createApp({ fetchImpl })).get("/api/silver");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
  });
});

describe("Silver rate caching", () => {
  it("reuses cached silver rates for repeated requests", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validSilverData()),
      jsonResponse(validFxData())
    );

    const app = createApp({ fetchImpl });

    const first = await request(app).get("/api/silver");
    const second = await request(app).get("/api/silver");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second.body.data).toEqual(first.body.data);
  });

  it("does not cache failed silver provider requests", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse(validFxData()))
      .mockResolvedValueOnce(jsonResponse(validSilverData()))
      .mockResolvedValueOnce(jsonResponse(validFxData()));

    const app = createApp({ fetchImpl });

    const first = await request(app).get("/api/silver");
    const second = await request(app).get("/api/silver");

    expect(first.status).toBe(502);
    expect(second.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("Additional server edge cases", () => {
  it("rejects a null gold API response", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(null),
      jsonResponse(validFxData())
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
    expect(response.body.detail).toContain("invalid response");
  });

  it("rejects an array returned by the currency API", async () => {
    const fetchImpl = createMockFetch(
      jsonResponse(validGoldData()),
      jsonResponse([])
    );

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
    expect(response.body.detail).toContain("exchange-rate response");
  });

  it("reports an upstream timeout", async () => {
    const timeout = new Error("Request timed out");
    timeout.name = "TimeoutError";

    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(jsonResponse(validFxData()));

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
    expect(response.body.detail).toContain("request timed out");
  });

  it("reports an upstream abort", async () => {
    const abort = new Error("Request aborted");
    abort.name = "AbortError";

    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce(jsonResponse(validFxData()));

    const response = await request(createApp({ fetchImpl })).get("/api/gold");

    expect(response.status).toBe(502);
    expect(response.body.status).toBe("error");
    expect(response.body.detail).toContain("request timed out");
  });
});
