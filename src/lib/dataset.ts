import { DATASET_VERSION } from "./types";

/**
 * Client-safe dataset helpers: pure parsing and naming with no filesystem
 * imports, so client components can parse a fetched dataset without
 * dragging node:fs into the browser bundle.
 */

/**
 * Parses and validates a generated dataset file. The consumer must fail
 * loudly on a truncated, drifted or empty dataset: failing open here used
 * to render a clean build of an empty site.
 */
export function parseDataset<T extends { version: number; jobs: unknown[] }>(text: string, what: string): T {
  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    throw new Error(`${what}: not valid JSON, refusing to build an empty site`);
  }
  if (parsed.version !== DATASET_VERSION) {
    throw new Error(`${what}: version ${String(parsed.version)}, expected ${DATASET_VERSION}; re-run pnpm ingest`);
  }
  if (!Array.isArray(parsed.jobs) || parsed.jobs.length === 0) {
    throw new Error(`${what}: dataset is empty`);
  }
  return parsed;
}

/**
 * Content-addressed name fragment for the published dataset asset: changes
 * every nightly refresh, so cache-first fetches of an old URL can never
 * serve stale data against a newer page.
 */
export function datasetSignature(generatedAt: string): string {
  const digits = generatedAt.replace(/[^0-9]/g, "");
  return `${digits.slice(0, 8)}T${digits.slice(8, 14)}`;
}
