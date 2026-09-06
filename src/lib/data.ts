import fs from "node:fs";
import path from "node:path";
import type { DatasetStats, IndexEntry, Job } from "./types";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

function readJson<T>(name: string): T | null {
  const file = path.join(GENERATED_DIR, name);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

interface JobsFile {
  generatedAt: string;
  jobs: Job[];
}

interface IndexFile {
  generatedAt: string;
  jobs: IndexEntry[];
}

export function getJobs(): JobsFile {
  return readJson<JobsFile>("jobs.json") ?? { generatedAt: "", jobs: [] };
}

export function getJobById(id: string): Job | null {
  return getJobs().jobs.find((job) => job.id === id) ?? null;
}

export function getIndexEntries(): IndexFile {
  return readJson<IndexFile>("index.json") ?? { generatedAt: "", jobs: [] };
}

export function getStats(): DatasetStats | null {
  return readJson<DatasetStats>("stats.json");
}

export function getQueryCount(): number {
  const queries = readJson<{ queries: string[] }>("queries.json");
  return queries?.queries.length ?? 0;
}

export function getAllJobIds(): string[] {
  return getJobs().jobs.map((job) => job.id);
}
