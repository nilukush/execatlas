import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { writeJsonAtomic } from "./write";
import type { SourceId } from "../../src/lib/types";

/**
 * Polite JSON fetcher for the ingestion pipeline:
 * - identifies itself with a real User-Agent
 * - keeps 1100 ms between requests to a host, 3500 ms for himalayas.app
 * - caches responses on disk so re-runs and tests do not re-hit sources
 * - tries a request at most three times, waiting as Retry-After asks, capped at 30 s
 * - fetches public http and https targets only
 */
export interface FeedFailure {
  source: SourceId;
  unit: string;
  status?: number;
  transient: boolean;
  message: string;
}

export interface FetchDeps {
  fetchJson: (url: string) => Promise<unknown>;
  // optional: a caller that ignores failed feeds stays valid
  reportFailure?: (failure: FeedFailure) => void;
}

export interface FetchOptions {
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  // tests replace both: sleep records a delay instead of waiting, now supplies the clock
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** The only error shape this module throws. `status` is undefined when no response arrived. */
export interface FetchError extends Error {
  status: number | undefined;
  // true when the same request can succeed later: 429, 5xx, a network error or a 2xx whose body is not JSON
  transient: boolean;
}

export const USER_AGENT =
  "ExecAtlasBot/0.1 (+https://github.com/execatlas; job aggregator; complies with robots.txt)";

const DEFAULT_INTERVAL_MS = 1100;
// the public allowance trips near request 21 at 1.1 seconds
const HOST_INTERVALS_MS: Readonly<Record<string, number>> = { "himalayas.app": 3500 };
const lastHitPerHost = new Map<string, number>();

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2000;
const MAX_WAIT_MS = 30_000;

// IANA special purpose ranges, and the multicast and the reserved block: no address inside
// them reaches a public host, apart from 192.0.0.9 and 192.0.0.10, which the 192.0.0.0/24
// entry refuses too
const NOT_GLOBAL_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const cacheDir = () => process.env.EXECATLAS_CACHE_DIR ?? path.join(process.cwd(), "data", "cache");

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// a query string can carry a key, so a failure message names an http or https URL up to its path only,
// whatever the case of its scheme
const URL_WITH_QUERY = /\bhttps?:\/\/[^\s"'`<>?]*\?[^\s"'`<>]*/gi;
// the user and the password before the host are a credential too, whatever the scheme of the URL;
// the scheme name is bounded at 20 characters, or every letter of a long run of glued letters
// costs a walk to the end of the run
const URL_USER_INFO = /(\b[a-z][a-z0-9+.-]{0,19}:\/\/)[^\s/?#"'`<>]*@/gi;
// the names a credential takes in the messages the pipeline writes
const CREDENTIAL_NAMES = "app_key|app_id|api_key|apikey|key|token|secret|password|pwd";
// a key can also sit in a text that is no URL, as the value of a parameter under the name of a credential;
// white space may stand around the equals sign, a line break included
const CREDENTIAL_PARAMETER = new RegExp(`(${CREDENTIAL_NAMES})(\\s*=\\s*)[^\\s"'\`<>&]+`, "gi");
// a JSON body states the same parameter as a quoted name and a quoted value
const CREDENTIAL_JSON_FIELD = new RegExp(`("(?:${CREDENTIAL_NAMES})"\\s*:\\s*)"[^"]*"`, "gi");
const CLOSING_PUNCTUATION = /[)\]},;:.]+$/;

/**
 * Masks the credentials a failure message of this pipeline can hold (ruling
 * R60): the query string of an http or https URL, the user and the password
 * of a URL of any scheme, the value of a parameter named like a credential,
 * and the value of such a name in a JSON body. A header line such as
 * "Authorization: Bearer ..." is not masked: no connector sends one. Running
 * it a second time changes nothing.
 */
export function withoutQueryString(text: string): string {
  return text
    .replace(URL_WITH_QUERY, (url) => {
      // punctuation that closes the sentence around the URL is no part of the URL
      return url.slice(0, url.indexOf("?")) + (url.match(CLOSING_PUNCTUATION)?.[0] ?? "");
    })
    .replace(URL_USER_INFO, "$1")
    .replace(CREDENTIAL_JSON_FIELD, '$1"***"')
    .replace(CREDENTIAL_PARAMETER, "$1$2***");
}

/**
 * The report every connector's catch makes for a feed that threw: the error
 * as a FeedFailure under its source and unit. An error that carries no
 * transient flag counts as transient. A thrown value that is not an Error
 * gives its message when that is a string, as a plain object thrown by a
 * library does, and else its text. A reporter that throws must not stop a
 * connector over a feed that already failed. The failure comes back for the
 * line the connector prints.
 */
export function reportFeedFailure(
  deps: Pick<FetchDeps, "reportFailure">,
  error: unknown,
  source: SourceId,
  unit: string
): FeedFailure {
  const thrown = (error ?? {}) as { status?: number; transient?: boolean; message?: unknown };
  const failure: FeedFailure = {
    source,
    unit,
    status: thrown.status,
    transient: thrown.transient ?? true,
    message: typeof thrown.message === "string" ? thrown.message : String(error),
  };
  try {
    deps.reportFailure?.(failure);
  } catch {
    // a broken reporter is no reason to lose the feeds that follow
  }
  return failure;
}

function fetchError(message: string, status: number | undefined, transient: boolean): FetchError {
  return Object.assign(new Error(withoutQueryString(message)), { status, transient });
}

const toUint32 = (ip: string): number => ip.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);

function blockedIpv4(address: string): boolean {
  const value = toUint32(address);
  return NOT_GLOBAL_IPV4.some(([base, bits]) => {
    const shift = 32 - bits;
    return value >>> shift === toUint32(base) >>> shift;
  });
}

function ipv6Groups(address: string): number[] {
  const [head = "", tail] = address.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const middle = Array.from({ length: 8 - left.length - right.length }, () => "0");
  return [...left, ...middle, ...right].map((group) => Number.parseInt(group, 16));
}

function blockedIpv6(address: string): boolean {
  const [first, second] = ipv6Groups(address);
  // global unicast is 2000::/3: loopback, unspecified, link local, unique local,
  // multicast and the IPv4 mapped forms all lie outside it
  if ((first & 0xe000) !== 0x2000) return true;
  return (
    (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) ||
    first === 0x2002 ||
    (first === 0x3fff && second <= 0x0fff)
  );
}

function blockedHost(hostname: string): boolean {
  const address = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (net.isIP(address) === 4) return blockedIpv4(address);
  if (net.isIP(address) === 6) return blockedIpv6(address);
  return hostname === "" || hostname === "localhost" || hostname.endsWith(".localhost");
}

/** Returns the hostname of a public http or https target, or throws a permanent FetchError. */
function publicHostOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw fetchError(`invalid URL: ${url}`, undefined, false);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw fetchError(`refuses ${url}: only http and https are fetched`, undefined, false);
  }
  // the URL parser lowercases a host but keeps a trailing dot
  const hostname = parsed.hostname.replace(/\.+$/, "");
  if (blockedHost(hostname)) {
    throw fetchError(`refuses ${url}: ${hostname} is not a public host`, undefined, false);
  }
  return hostname;
}

function intervalMs(host: string): number {
  const rule = Object.entries(HOST_INTERVALS_MS).find(([name]) => host === name || host.endsWith(`.${name}`));
  return rule === undefined ? DEFAULT_INTERVAL_MS : rule[1];
}

async function pace(host: string, sleep: (ms: number) => Promise<void>, now: () => number): Promise<void> {
  const interval = intervalMs(host);
  const last = lastHitPerHost.get(host);
  // a clock that steps back must not turn the step into a wait: no wait outgrows the interval
  const idleMs = last === undefined ? 0 : Math.min(last + interval - now(), interval);
  if (idleMs > 0) await sleep(idleMs);
  lastHitPerHost.set(host, now());
}

function retryAfterMs(header: string | null | undefined, now: number): number | undefined {
  if (header === undefined || header === null) return undefined;
  const text = header.trim();
  const seconds = text === "" ? Number.NaN : Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : at - now;
}

function retryDelayMs(header: string | null | undefined, retry: number, now: number): number {
  const askedMs = retryAfterMs(header, now);
  // the backoff doubles and carries a jitter of up to half of itself
  const backoffMs = BASE_BACKOFF_MS * 2 ** (retry - 1) * (1 + Math.random() / 2);
  // a Retry-After that names no moment in the future leaves the wait to the backoff
  return Math.min(Math.round(askedMs !== undefined && askedMs > 0 ? askedMs : backoffMs), MAX_WAIT_MS);
}

async function politeFetch(
  url: string,
  host: string,
  deps: Required<Pick<FetchOptions, "fetchImpl" | "sleep" | "now">>
): Promise<unknown> {
  const doFetch = () =>
    deps.fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

  for (let attempt = 1; ; attempt += 1) {
    await pace(host, deps.sleep, deps.now);

    let res: Response;
    try {
      res = await doFetch();
    } catch (error) {
      // a network error gets one retry
      if (attempt > 1) {
        throw fetchError(`network error for ${url}: ${error instanceof Error ? error.message : String(error)}`, undefined, true);
      }
      await deps.sleep(retryDelayMs(undefined, attempt, deps.now()));
      continue;
    }

    if (res.ok) {
      try {
        return await res.json();
      } catch (error) {
        // a 2xx whose body is not JSON counts as transient (ruling R28)
        throw fetchError(
          `body of ${url} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
          res.status,
          true
        );
      }
    }

    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt === MAX_ATTEMPTS) {
      throw fetchError(`HTTP ${res.status} for ${url}`, res.status, transient);
    }
    await deps.sleep(retryDelayMs(res.headers.get("retry-after"), attempt, deps.now()));
  }
}

export async function cachedFetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const { ttlMs = 6 * 60 * 60 * 1000, fetchImpl = fetch, sleep = realSleep, now = Date.now } = options;
  const host = publicHostOf(url);

  const file = cacheFilePath(url);
  if (fs.existsSync(file)) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as { savedAt: number; data: unknown };
      if (Date.now() - cached.savedAt < ttlMs) return cached.data;
    } catch {
      // a half-written cache file must read as a miss, not crash every run
      fs.rmSync(file, { force: true });
    }
  }

  const data = await politeFetch(url, host, { fetchImpl, sleep, now });

  fs.mkdirSync(cacheDir(), { recursive: true });
  writeJsonAtomic(file, { savedAt: Date.now(), data });
  return data;
}

export function cacheFilePath(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  return path.join(cacheDir(), `${hash}.json`);
}
