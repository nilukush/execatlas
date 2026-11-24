import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cacheFilePath, cachedFetchJson } from "./http";
import type { FetchError } from "./http";

// tests get their own cache root so a crash can never litter the live cache
let testCacheRoot: string;

beforeEach(() => {
  testCacheRoot = fs.mkdtempSync(path.join(process.cwd(), "data", "execatlas-http-test-"));
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

type Step = { status: number; retryAfter?: string } | "reject";

// the last step answers every later call, so one step stands for "on every call";
// a step without Retry-After sends no headers at all, like a bare stub
function scriptedFetch(steps: Step[]) {
  const calls: string[] = [];
  const fetchImpl = async (url: string): Promise<unknown> => {
    calls.push(url);
    const step = steps[Math.min(calls.length, steps.length) - 1];
    if (step === "reject") throw new TypeError("fetch failed");
    const retryAfter = step.retryAfter;
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      ...(retryAfter === undefined
        ? {}
        : { headers: { get: (name: string) => (name === "retry-after" ? retryAfter : null) } }),
      json: async () => ({ fresh: true }),
    };
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

// The pacing map is module state that outlives a test. Every recorder starts
// on a later day than the one before it, so a host hit in one test is never
// still cooling down in the next.
let clockStart = Date.UTC(2026, 10, 1);

function request(steps: Step[] | ((now: number) => Step[])) {
  clockStart += 86_400_000;
  let time = clockStart;
  const waits: number[] = [];
  const now = (): number => time;
  const sleep = async (ms: number): Promise<void> => {
    waits.push(ms);
    time += ms;
  };
  const { calls, fetchImpl } = scriptedFetch(typeof steps === "function" ? steps(now()) : steps);
  return {
    calls,
    waits,
    advance: (ms: number): void => {
      time += ms;
    },
    get: (url: string): Promise<unknown> => cachedFetchJson(url, { fetchImpl, sleep, now }),
  };
}

async function failure(promise: Promise<unknown>): Promise<FetchError> {
  try {
    await promise;
  } catch (error) {
    return error as FetchError;
  }
  throw new Error("the fetch was expected to fail");
}

describe("cachedFetchJson retries", () => {
  const url = (path: string): string => `https://retry.unit-test.example/${path}`;

  it("waits the Retry-After seconds before it retries a 429", async () => {
    const { calls, waits, get } = request([{ status: 429, retryAfter: "2" }, { status: 200 }]);

    expect(await get(url("retry-after-seconds"))).toEqual({ fresh: true });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000]);
  });

  it("waits between 2000 and 3000 ms before it retries a 500 that has no Retry-After", async () => {
    const { calls, waits, get } = request([{ status: 500 }, { status: 200 }]);

    await get(url("no-retry-after"));
    expect(calls).toHaveLength(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(2000);
    expect(waits[0]).toBeLessThanOrEqual(3000);
  });

  it("doubles the wait for a second retry", async () => {
    const { calls, waits, get } = request([{ status: 503 }]);

    const error = await failure(get(url("doubling")));
    expect(calls).toHaveLength(3);
    expect(error.status).toBe(503);
    expect(error.transient).toBe(true);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThanOrEqual(2000);
    expect(waits[0]).toBeLessThanOrEqual(3000);
    expect(waits[1]).toBeGreaterThanOrEqual(4000);
    expect(waits[1]).toBeLessThanOrEqual(6000);
  });

  it("gives up after three calls of 429 with a transient error that carries the status", async () => {
    const { calls, waits, get } = request([{ status: 429 }]);

    const error = await failure(get(url("always-429")));
    expect(calls).toHaveLength(3);
    expect(waits).toHaveLength(2);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("HTTP 429 for https://retry.unit-test.example/always-429");
    expect(error.status).toBe(429);
    expect(error.transient).toBe(true);
  });

  it("fails a 404 on the first call with a permanent error that carries the status", async () => {
    const { calls, waits, get } = request([{ status: 404 }]);

    const error = await failure(get(url("not-found")));
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
    expect(error.message).toBe("HTTP 404 for https://retry.unit-test.example/not-found");
    expect(error.status).toBe(404);
    expect(error.transient).toBe(false);
  });

  it("caps a long Retry-After at 30000 ms", async () => {
    const { calls, waits, get } = request([{ status: 429, retryAfter: "3600" }, { status: 200 }]);

    await get(url("long-retry-after"));
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([30000]);
  });

  it("waits until the HTTP date of a Retry-After", async () => {
    const { calls, waits, get } = request((now) => [
      { status: 503, retryAfter: new Date(now + 3000).toUTCString() },
      { status: 200 },
    ]);

    await get(url("retry-after-date"));
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([3000]);
  });

  const unusable: ReadonlyArray<[string, (now: number) => string]> = [
    ["lies in the past", (now) => new Date(now - 60_000).toUTCString()],
    ["is zero", () => "0"],
    ["is neither a delay nor a date", () => "soon"],
  ];

  it.each(unusable)("falls back to its own backoff when the Retry-After %s", async (_case, retryAfter) => {
    const { calls, waits, get } = request((now) => [{ status: 429, retryAfter: retryAfter(now) }, { status: 200 }]);

    await get(url("retry-after-unusable"));
    expect(calls).toHaveLength(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(2000);
    expect(waits[0]).toBeLessThanOrEqual(3000);
  });

  it("retries a rejected fetch once, then fails with a transient error", async () => {
    const { calls, waits, get } = request(["reject"]);

    const error = await failure(get(url("network")));
    expect(calls).toHaveLength(2);
    expect(waits).toHaveLength(1);
    expect(error.status).toBeUndefined();
    expect(error.transient).toBe(true);
  });
});

describe("cachedFetchJson per host pacing", () => {
  const page = (host: string, n: number): string => `https://${host}/jobs/api/search?page=${n}`;

  it("keeps 3500 ms between two requests to himalayas.app", async () => {
    const { calls, waits, get } = request([{ status: 200 }]);

    await get(page("himalayas.app", 1));
    await get(page("himalayas.app", 2));
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([3500]);
  });

  it("counts the time that already passed since the last himalayas.app request", async () => {
    const { waits, get, advance } = request([{ status: 200 }]);

    await get(page("himalayas.app", 1));
    advance(2000);
    await get(page("himalayas.app", 2));
    expect(waits).toEqual([1500]);
  });

  it("keeps 1100 ms between two requests to api.adzuna.com", async () => {
    const { calls, waits, get } = request([{ status: 200 }]);

    await get(page("api.adzuna.com", 1));
    await get(page("api.adzuna.com", 2));
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([1100]);
  });

  it("paces a subdomain of himalayas.app like himalayas.app", async () => {
    const { waits, get } = request([{ status: 200 }]);

    await get(page("www.himalayas.app", 1));
    await get(page("www.himalayas.app", 2));
    expect(waits).toEqual([3500]);
  });

  it("leaves a host that only ends with the name at 1100 ms", async () => {
    const { waits, get } = request([{ status: 200 }]);

    await get(page("nothimalayas.app", 1));
    await get(page("nothimalayas.app", 2));
    expect(waits).toEqual([1100]);
  });

  it("keeps 3500 ms between himalayas.app requests across a retry", async () => {
    const { calls, waits, get } = request([{ status: 429, retryAfter: "2" }, { status: 200 }]);

    await get(page("himalayas.app", 1));
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000, 1500]);
  });
});

describe("cachedFetchJson public target guard", () => {
  async function refused(target: string): Promise<void> {
    const { calls, waits, get } = request([{ status: 200 }]);

    const error = await failure(get(target));
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBeUndefined();
    expect(error.transient).toBe(false);
    expect(calls).toEqual([]);
    expect(waits).toEqual([]);
  }

  async function fetched(target: string): Promise<void> {
    const { calls, waits, get } = request([{ status: 200 }]);

    expect(await get(target)).toEqual({ fresh: true });
    expect(calls).toEqual([target]);
    expect(waits).toEqual([]);
  }

  const ranges: ReadonlyArray<{ range: string; refused: readonly string[]; allowed: readonly string[] }> = [
    { range: "0.0.0.0/8", refused: ["0.0.0.0", "0.255.255.255"], allowed: ["1.0.0.0"] },
    { range: "10.0.0.0/8", refused: ["10.0.0.1", "10.255.255.255"], allowed: ["9.255.255.255", "11.0.0.1"] },
    {
      range: "100.64.0.0/10",
      refused: ["100.64.0.0", "100.127.255.255"],
      allowed: ["100.63.255.255", "100.128.0.0"],
    },
    { range: "127.0.0.0/8", refused: ["127.0.0.1", "127.255.255.255"], allowed: ["126.255.255.255", "128.0.0.1"] },
    {
      range: "169.254.0.0/16",
      refused: ["169.254.0.0", "169.254.255.255"],
      allowed: ["169.253.255.255", "169.255.0.0"],
    },
    {
      range: "172.16.0.0/12",
      refused: ["172.16.0.1", "172.31.255.255"],
      allowed: ["172.15.255.255", "172.32.0.0"],
    },
    { range: "192.0.0.0/24", refused: ["192.0.0.1", "192.0.0.255"], allowed: ["192.0.1.0"] },
    { range: "192.0.2.0/24", refused: ["192.0.2.1", "192.0.2.255"], allowed: ["192.0.1.255", "192.0.3.0"] },
    {
      range: "192.168.0.0/16",
      refused: ["192.168.1.1", "192.168.255.255"],
      allowed: ["192.167.255.255", "192.169.0.0"],
    },
    {
      range: "198.18.0.0/15",
      refused: ["198.18.0.0", "198.19.255.255"],
      allowed: ["198.17.255.255", "198.20.0.0"],
    },
    {
      range: "198.51.100.0/24",
      refused: ["198.51.100.1", "198.51.100.255"],
      allowed: ["198.51.99.255", "198.51.101.0"],
    },
    {
      range: "203.0.113.0/24",
      refused: ["203.0.113.1", "203.0.113.255"],
      allowed: ["203.0.112.255", "203.0.114.0"],
    },
    { range: "224.0.0.0/4", refused: ["224.0.0.1", "239.255.255.255"], allowed: ["223.255.255.255"] },
    { range: "240.0.0.0/4", refused: ["240.0.0.1", "255.255.255.255"], allowed: [] },
  ];

  const inside = ranges.flatMap(({ range, refused }) => refused.map((ip) => ({ range, ip })));
  const outside = ranges.flatMap(({ range, allowed }) => allowed.map((ip) => ({ range, ip })));

  it.each(inside)("refuses $ip before any request, inside $range", async ({ ip }) => refused(`http://${ip}/x`));

  it.each(outside)("fetches $ip, the address next to $range", async ({ ip }) => fetched(`http://${ip}/x`));

  const refusedHosts = [
    "localhost",
    "www.localhost",
    "a.b.localhost",
    "localhost.",
    "[::1]",
    "[0:0:0:0:0:0:0:1]",
    "[::]",
    "[::ffff:127.0.0.1]",
    "[fe80::1]",
    "[fc00::1]",
    "[fd12:3456::1]",
    "[fec0::1]",
    "[ff02::1]",
    "[64:ff9b::7f00:1]",
    "[100::1]",
    "[2001::1]",
    "[2001:1ff::]",
    "[2001:db8::1]",
    "[2002:7f00:1::]",
    "[3fff::1]",
    "[4000::1]",
    "2130706433",
    "0x7f.0.0.1",
    "0177.0.0.1",
    "127.1",
  ];

  it.each(refusedHosts)("refuses http://%s before any request", async (host) => refused(`http://${host}/x`));

  const refusedTargets = [
    "ftp://example.com/x",
    "file:///etc/passwd",
    "data:application/json,{}",
    "javascript:1",
    "http://example.com@localhost/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://./x",
    "http://[fe80::1%25eth0]/x",
    "not a url",
  ];

  it.each(refusedTargets)("refuses %s before any request", async (target) => refused(target));

  const publicHosts = [
    "unit-test.example",
    "api.adzuna.com",
    "www.himalayas.app",
    "8.8.8.8",
    "[2606:4700::1]",
    "[2001:200::]",
    "[2001:4860:4860::8888]",
    "[3fff:1000::1]",
    "[3fff:ffff::1]",
  ];

  it.each(publicHosts)("fetches https://%s/x", async (host) => fetched(`https://${host}/x`));

  it("refuses a private target even when its cache entry is fresh", async () => {
    const target = "http://127.0.0.1/x";
    fs.writeFileSync(cacheFilePath(target), JSON.stringify({ savedAt: Date.now(), data: { cached: true } }));

    await refused(target);
  });
});

describe("cachedFetchJson on a 2xx whose body is not JSON", () => {
  it("rejects with a transient FetchError that carries status 200 and names the body", async () => {
    const url = "https://unit-test.example/not-json";
    const notJson = async (): Promise<unknown> => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    });
    const error: FetchError = await cachedFetchJson(url, {
      ttlMs: 60_000,
      fetchImpl: notJson as unknown as typeof fetch,
      sleep: async () => {},
    }).then(
      () => {
        throw new Error("a body that is not JSON must not resolve");
      },
      (reason: FetchError) => reason
    );
    expect(error).toMatchObject({ status: 200, transient: true });
    expect(error.message).toMatch(/is not JSON/);
  });
});
