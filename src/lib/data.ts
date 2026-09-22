import fs from "node:fs";
import path from "node:path";
import { DATASET_VERSION } from "./types";
import type { DatasetStats, IndexFile, JobsFile } from "./types";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

/**
 * Parses and validates a generated dataset file. The build must fail loudly
 * on a truncated, drifted or empty dataset: failing open here used to render
 * a clean build of an empty site.
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

function readText(name: string): string {
  // basename guards against traversal even though every call site passes a
  // fixed literal today
  const file = path.join(GENERATED_DIR, path.basename(name));
  if (!fs.existsSync(file)) throw new Error(`${name}: missing from data/generated; run pnpm ingest`);
  return fs.readFileSync(file, "utf8");
}

// build-time dataset is immutable during a run; parse each file once
let jobsCache: JobsFile | null = null;
let indexCache: IndexFile | null = null;

export function getJobs(): JobsFile {
  if (!jobsCache) jobsCache = parseDataset<JobsFile>(readText("jobs.json"), "jobs.json");
  return jobsCache;
}

export function getJobById(id: string) {
  return getJobs().jobs.find((job) => job.id === id) ?? null;
}

export function getIndexEntries(): IndexFile {
  if (!indexCache) indexCache = parseDataset<IndexFile>(readText("index.json"), "index.json");
  return indexCache;
}

export function getStats(): DatasetStats {
  return JSON.parse(readText("stats.json")) as DatasetStats;
}

export function getQueryCount(): number {
  const queries = JSON.parse(readText("queries.json")) as { queries: string[] };
  return queries.queries.length;
}

export function getAllJobIds(): string[] {
  return getJobs().jobs.map((job) => job.id);
}
