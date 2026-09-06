import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Polite JSON fetcher for the ingestion pipeline:
 * - identifies itself with a real User-Agent
 * - keeps at least ~1.1s between requests to the same host
 * - caches responses on disk so re-runs and tests do not re-hit sources
 * - retries once on 429/5xx
 */
export interface FetchDeps {
  fetchJson: (url: string) => Promise<unknown>;
}

export const USER_AGENT =
  "ExecAtlasBot/0.1 (+https://github.com/execatlas; job aggregator; complies with robots.txt)";

const MIN_INTERVAL_MS = 1100;
const lastHitPerHost = new Map<string, number>();

const cacheDir = () => path.join(process.cwd(), "data", "cache");

export function clearRequestThrottle() {
  lastHitPerHost.clear();
}

async function politeFetch(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const host = new URL(url).host;
  const last = lastHitPerHost.get(host) ?? 0;
  const wait = last + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastHitPerHost.set(host, Date.now());

  const doFetch = () =>
    fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

  let res = await doFetch();
  if (res.status === 429 || res.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

export async function cachedFetchJson(
  url: string,
  options: { ttlMs?: number; fetchImpl?: typeof fetch; noCache?: boolean } = {}
): Promise<unknown> {
  const { ttlMs = 6 * 60 * 60 * 1000, fetchImpl = fetch, noCache = false } = options;

  if (!noCache) {
    const file = cacheFile(url);
    if (fs.existsSync(file)) {
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as { savedAt: number; data: unknown };
      if (Date.now() - cached.savedAt < ttlMs) return cached.data;
    }
  }

  const data = await politeFetch(url, fetchImpl);

  if (!noCache) {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFile(url), JSON.stringify({ savedAt: Date.now(), data }));
  }
  return data;
}

function cacheFile(url: string): string {
  const hash = crypto.createHash("sha1").update(url).digest("hex");
  return path.join(cacheDir(), `${hash}.json`);
}
