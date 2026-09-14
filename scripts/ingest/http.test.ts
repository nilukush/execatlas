import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cacheFilePath, cachedFetchJson } from "./http";

// tests get their own cache root so a crash can never litter the live cache
let testCacheRoot: string;

beforeEach(() => {
  testCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "execatlas-http-test-"));
  process.env.EXECATLAS_CACHE_DIR = testCacheRoot;
});

afterEach(() => {
  fs.rmSync(testCacheRoot, { recursive: true, force: true });
  delete process.env.EXECATLAS_CACHE_DIR;
});

const stubFetch = vi.fn(async () =>
  ({ ok: true, status: 200, json: async () => ({ fresh: true }) }) as unknown as Response
);

describe("cachedFetchJson disk cache", () => {
  it("treats a corrupt cache file as a miss, refetches, and repairs the file", async () => {
    const url = "https://unit-test.example/corrupt.json";
    const file = cacheFilePath(url);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");

    const data = (await cachedFetchJson(url, { ttlMs: 60_000, fetchImpl: stubFetch as unknown as typeof fetch })) as {
      fresh: boolean;
    };
    expect(data.fresh).toBe(true);
    expect(stubFetch).toHaveBeenCalledTimes(1);
    const repaired = JSON.parse(fs.readFileSync(file, "utf8")) as { data: { fresh: boolean } };
    expect(repaired.data.fresh).toBe(true);
    fs.rmSync(file, { force: true });
  });

  it("serves a fresh cache entry without fetching", async () => {
    const url = "https://unit-test.example/fresh.json";
    const file = cacheFilePath(url);
    fs.writeFileSync(file, JSON.stringify({ savedAt: Date.now(), data: { cached: true } }));
    stubFetch.mockClear();

    const data = (await cachedFetchJson(url, { ttlMs: 60_000, fetchImpl: stubFetch as unknown as typeof fetch })) as {
      cached: boolean;
    };
    expect(data.cached).toBe(true);
    expect(stubFetch).not.toHaveBeenCalled();
    fs.rmSync(file, { force: true });
  });
});
