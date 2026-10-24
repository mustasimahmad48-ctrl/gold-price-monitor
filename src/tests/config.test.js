
"use strict";

import { describe, it, expect } from "vitest";
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "../..");
const serverPath = path.join(projectRoot, "server.js");

function loadServerWithEnv(overrides) {
  const env = { ...process.env };

  // Remove project configuration so each test uses controlled values.
  for (const key of [
    "PORT",
    "REQUEST_TIMEOUT_MS",
    "MAX_GOLD_AGE_MS",
    "CACHE_TTL_MS",
    "GOLD_API_URL",
    "SILVER_API_URL",
    "CURRENCY_API_URL",
  ]) {
    delete env[key];
  }

  Object.assign(env, overrides);

  return spawnSync(
    process.execPath,
    ["-e", `require(${JSON.stringify(serverPath)})`],
    {
      cwd: projectRoot,
      env,
      encoding: "utf8",
      timeout: 5000,
    }
  );
}

describe("Server configuration validation", () => {
  it("rejects a zero port", () => {
    const result = loadServerWithEnv({ PORT: "0" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "PORT must be a positive integer."
    );
  });

  it("rejects a non-numeric cache TTL", () => {
    const result = loadServerWithEnv({ CACHE_TTL_MS: "abc" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "CACHE_TTL_MS must be a positive integer."
    );
  });

  it("rejects an integer outside the safe range", () => {
    const result = loadServerWithEnv({
      REQUEST_TIMEOUT_MS: "9007199254740992",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "REQUEST_TIMEOUT_MS is outside the supported range."
    );
  });

  it("rejects a malformed gold API URL", () => {
    const result = loadServerWithEnv({
      GOLD_API_URL: "not-a-valid-url",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "GOLD_API_URL must be a valid URL."
    );
  });

  it("rejects a non-HTTP URL protocol", () => {
    const result = loadServerWithEnv({
      GOLD_API_URL: "file:///tmp/gold.json",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "GOLD_API_URL must use HTTP or HTTPS."
    );
  });

  it("loads successfully with valid configuration", () => {
    const result = loadServerWithEnv({
      PORT: "3001",
      CACHE_TTL_MS: "1000",
      GOLD_API_URL: "https://example.com/gold",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(
      "must be a positive integer"
    );
  });
});
