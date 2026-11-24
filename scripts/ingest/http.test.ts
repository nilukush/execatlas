import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cacheFilePath, cachedFetchJson, reportFeedFailure, withoutQueryString } from "./http";
import type { FeedFailure, FetchError } from "./http";

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

// every stub answers with headers, as a real Response does
const stubFetch = vi.fn(async () =>
  ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ fresh: true }) }) as unknown as Response
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

type Step = { status: number; retryAfter?: string; notJson?: boolean } | "reject";

// the last step answers every later call, so one step stands for "on every call";
// a step without Retry-After names none, as a response without the header does
function scriptedFetch(steps: Step[]) {
  const calls: string[] = [];
  const fetchImpl = async (url: string): Promise<unknown> => {
    calls.push(url);
    const step = steps[Math.min(calls.length, steps.length) - 1];
    if (step === "reject") throw new TypeError("fetch failed");
    const retryAfter = step.retryAfter ?? null;
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      headers: { get: (name: string) => (name === "retry-after" ? retryAfter : null) },
      json: async () => {
        if (step.notJson) throw new SyntaxError("Unexpected token < in JSON at position 0");
        return { fresh: true };
      },
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
    // the one wait before the retry is the first backoff
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(2000);
    expect(waits[0]).toBeLessThanOrEqual(3000);
    expect(error.status).toBeUndefined();
    expect(error.transient).toBe(true);
  });
});

describe("a failure message names no query string", () => {
  const key = "SECRETVALUE";

  it("holds neither the query string of a failed request nor any of its parameter values", async () => {
    const { get } = request([{ status: 429 }]);
    const error = await failure(get(`https://retry.unit-test.example/always-429?app_id=abc123&app_key=${key}&what=x`));
    expect(error.status).toBe(429);
    expect(error.message).toBe("HTTP 429 for https://retry.unit-test.example/always-429");
    expect(error.message).not.toContain("?");
    expect(error.message).not.toContain(key);
    expect(error.message).not.toContain("abc123");
  });

  it("keeps the detail that follows the URL in a network error", async () => {
    const { get } = request(["reject"]);
    const error = await failure(get(`https://retry.unit-test.example/network?app_key=${key}`));
    expect(error.message).toBe("network error for https://retry.unit-test.example/network: fetch failed");
  });

  it("holds neither the user and the password of the request URL nor the query of an upper case scheme", async () => {
    const { get } = request([{ status: 429 }]);
    const withUser = await failure(get(`https://user:${key}@retry.unit-test.example/user`));
    expect(withUser.message).toBe("HTTP 429 for https://retry.unit-test.example/user");
    const upperCase = await failure(get(`HTTPS://retry.unit-test.example/upper-case?app_key=${key}`));
    expect(upperCase.message).toBe("HTTP 429 for HTTPS://retry.unit-test.example/upper-case");
  });
});

describe("withoutQueryString", () => {
  it("removes the query string of every http and https URL in a text", () => {
    expect(withoutQueryString("https://api.example.test/search?app_id=abc123&app_key=SECRETVALUE&what=x")).toBe(
      "https://api.example.test/search"
    );
    const text =
      "HTTP 429 for http://api.example.test/a?k=1 and https://api.example.test/b?k=2, then https://api.example.test/c";
    expect(withoutQueryString(text)).toBe(
      "HTTP 429 for http://api.example.test/a and https://api.example.test/b, then https://api.example.test/c"
    );
  });

  it("is safe to run twice", () => {
    const text = "network error for https://api.example.test/search?app_id=abc123&app_key=SECRETVALUE&what=x: failed";
    const once = withoutQueryString(text);
    expect(once).toBe("network error for https://api.example.test/search: failed");
    expect(withoutQueryString(once)).toBe(once);
  });

  it("matches the scheme in any case, and is safe to run twice there too", () => {
    const text = "HTTP 429 for HTTPS://api.adzuna.com/v1/api/jobs/sg/search/1?app_id=abc&app_key=SECRETVALUE";
    const once = withoutQueryString(text);
    expect(once).toBe("HTTP 429 for HTTPS://api.adzuna.com/v1/api/jobs/sg/search/1");
    expect(withoutQueryString(once)).toBe(once);
    expect(withoutQueryString("HTTP 429 for Https://api.example.test/search?app_key=SECRETVALUE")).toBe(
      "HTTP 429 for Https://api.example.test/search"
    );
  });

  it("removes the user and the password before the host", () => {
    expect(withoutQueryString("HTTP 401 for https://user:SECRETVALUE@api.adzuna.com/v1/api/jobs/sg/search/1")).toBe(
      "HTTP 401 for https://api.adzuna.com/v1/api/jobs/sg/search/1"
    );
    // a user alone, and a user before a query string
    expect(withoutQueryString("HTTP 401 for https://SECRETVALUE@api.example.test/a?x=1")).toBe(
      "HTTP 401 for https://api.example.test/a"
    );
  });

  // every name a credential takes, in lower, upper and capitalised case
  const credentialNames = ["app_key", "app_id", "api_key", "apikey", "key", "token", "secret", "password", "pwd"];
  const casedNames = credentialNames.flatMap((name) => [
    name,
    name.toUpperCase(),
    name.charAt(0).toUpperCase() + name.slice(1),
  ]);

  it.each(casedNames)("masks the value of a parameter named %s, also outside a URL", (name) => {
    const text = `request failed, ${name}=SECRETVALUE rejected`;
    expect(withoutQueryString(text)).toBe(`request failed, ${name}=*** rejected`);
    const once = withoutQueryString(text);
    expect(withoutQueryString(once)).toBe(once);
  });

  it("masks each parameter on its own and leaves the rest of the text as it was", () => {
    expect(withoutQueryString("sent app_id=abc123&app_key=SECRETVALUE&what=x, got a 401")).toBe(
      "sent app_id=***&app_key=***&what=x, got a 401"
    );
    // a name that ends in the name of a credential is one too
    expect(withoutQueryString("client_secret=SECRETVALUE rejected")).toBe("client_secret=*** rejected");
  });

  // each row keeps the output the lower case query rule gave before the other rules were added
  const kept: ReadonlyArray<[string, string, string]> = [
    [
      "a closing bracket and full stop after a URL",
      "HTTP 500 for https://api.adzuna.com/v1/api/jobs/gb/search/1?app_key=SECRETVALUE).",
      "HTTP 500 for https://api.adzuna.com/v1/api/jobs/gb/search/1).",
    ],
    [
      "two URLs in one text",
      "a https://a.test/p?app_key=SECRETVALUE then https://b.test/q?k=SECRETVALUE.",
      "a https://a.test/p then https://b.test/q.",
    ],
    ["a question mark in prose", "What? See https://a.test/p and tell me.", "What? See https://a.test/p and tell me."],
    [
      "a URL without a query",
      "HTTP 404 for https://boards.greenhouse.io/v1/boards/acme/jobs",
      "HTTP 404 for https://boards.greenhouse.io/v1/boards/acme/jobs",
    ],
    ["a URL in quotes", `failed for "https://a.test/p?app_key=SECRETVALUE" today`, `failed for "https://a.test/p" today`],
    ["a URL in brackets", "failed (<https://a.test/p?app_key=SECRETVALUE>) today", "failed (<https://a.test/p>) today"],
    ["a bare host with a query", "HTTP 429 for https://a.test?app_key=SECRETVALUE", "HTTP 429 for https://a.test"],
    ["a query and a fragment", "HTTP 429 for https://a.test/p?app_key=SECRETVALUE#top", "HTTP 429 for https://a.test/p"],
    ["a URL followed by a word with no space", "for https://a.test/p?app_key=SECRETVALUEand-more text", "for https://a.test/p text"],
  ];

  it.each(kept)("keeps the output of %s", (_case, text, output) => {
    expect(withoutQueryString(text)).toBe(output);
  });
});

describe("reportFeedFailure", () => {
  // a plain array: vitest clears mock call history before each test
  function recorder() {
    const reported: FeedFailure[] = [];
    return {
      reported,
      reportFailure: (failure: FeedFailure) => {
        reported.push(failure);
      },
    };
  }

  it("reports a feed that threw under its source and unit, with the status, the flag and the message of the error", () => {
    const { reported, reportFailure } = recorder();
    const thrown = Object.assign(new Error("HTTP 429"), { status: 429, transient: true });

    const failure = reportFeedFailure({ reportFailure }, thrown, "greenhouse", "deadboard");
    expect(reported).toEqual([{ source: "greenhouse", unit: "deadboard", status: 429, transient: true, message: "HTTP 429" }]);
    // the same failure comes back, for the line the connector prints
    expect(failure).toBe(reported[0]);
  });

  it("counts an error that carries no flag as transient, and keeps a flag that says false", () => {
    const { reported, reportFailure } = recorder();

    reportFeedFailure({ reportFailure }, new Error("boom"), "greenhouse", "deadboard");
    reportFeedFailure({ reportFailure }, Object.assign(new Error("HTTP 404"), { status: 404, transient: false }), "greenhouse", "gone");
    expect(reported).toEqual([
      { source: "greenhouse", unit: "deadboard", status: undefined, transient: true, message: "boom" },
      { source: "greenhouse", unit: "gone", status: 404, transient: false, message: "HTTP 404" },
    ]);
  });

  it("gives a thrown value that is not an Error its text as the message", () => {
    const { reported, reportFailure } = recorder();

    reportFeedFailure({ reportFailure }, "quota exceeded", "greenhouse", "deadboard");
    expect(reported).toEqual([
      { source: "greenhouse", unit: "deadboard", status: undefined, transient: true, message: "quota exceeded" },
    ]);
  });

  it("answers the failure when there is no reporter", () => {
    expect(reportFeedFailure({}, new Error("boom"), "greenhouse", "deadboard")).toEqual({
      source: "greenhouse",
      unit: "deadboard",
      status: undefined,
      transient: true,
      message: "boom",
    });
  });

  it("holds a reporter that throws, and still answers the failure", () => {
    const breaking = () => {
      throw new Error("the reporter broke");
    };

    let answered: FeedFailure | undefined;
    expect(() => {
      answered = reportFeedFailure({ reportFailure: breaking }, new Error("boom"), "greenhouse", "deadboard");
    }).not.toThrow();
    expect(answered).toMatchObject({ source: "greenhouse", unit: "deadboard", transient: true, message: "boom" });
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

  it("waits no longer than the host interval when the clock steps back between two requests", async () => {
    const { waits, get, advance } = request([{ status: 200 }]);

    await get(page("himalayas.app", 1));
    // the clock steps back an hour: the step must not become an hour of waiting
    advance(-3_600_000);
    await get(page("himalayas.app", 2));
    expect(waits).toEqual([3500]);
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
      refused: ["192.168.0.1", "192.168.255.255"],
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
  it("fails on the first call, with no wait, a transient FetchError that carries status 200 and names the body", async () => {
    const target = "https://unit-test.example/not-json";
    const { calls, waits, get } = request([{ status: 200, notJson: true }]);

    const error = await failure(get(target));
    expect(error).toMatchObject({ status: 200, transient: true });
    expect(error.message).toMatch(/is not JSON/);
    // a body that is not JSON is not asked for again
    expect(calls).toEqual([target]);
    expect(waits).toEqual([]);
  });
});
