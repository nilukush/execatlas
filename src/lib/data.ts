import fs from "node:fs";
import path from "node:path";
import type { DatasetStats, IndexFile, JobsFile } from "./types";
import { parseDataset } from "./dataset";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

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

export { parseDataset, datasetSignature } from "./dataset";
