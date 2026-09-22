import fs from "node:fs";

// local runs read .env.local when present; real environment variables win
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local (CI, fresh clones): nothing to load
}
import path from "node:path";
import { cachedFetchJson } from "./http";
import {
  GREENHOUSE_TOKENS,
  WORKABLE_LOCATIONS,
  WORKABLE_QUERIES,
  ARBEITNOW_PAGES,
  JOBICY_COUNT,
  JOBICY_TAGS,
  LEVER_TOKENS,
  LEVER_COMPANY_NAMES,
  ASHBY_TOKENS,
  ASHBY_COMPANY_NAMES,
  HIMALAYAS_PAGES,
  HIMALAYAS_QUERIES,
  ADZUNA_COUNTRIES,
  ADZUNA_QUERIES,
} from "./config";
import { greenhouseConnector } from "./connectors/greenhouse";
import { workableConnector } from "./connectors/workable";
import { arbeitnowConnector } from "./connectors/arbeitnow";
import { jobicyConnector } from "./connectors/jobicy";
import { leverConnector } from "./connectors/lever";
import { ashbyConnector } from "./connectors/ashby";
import { himalayasConnector } from "./connectors/himalayas";
import { adzunaConnector } from "./connectors/adzuna";
import { normalizeJob, stableId, stableUpdatedAt } from "./normalize";
import { dedupeJobs } from "./dedupe";
import { datasetProblems, shouldRunSanityGate } from "./sanity";
import { writeJsonAtomic } from "./write";
import { buildQueryMatrix } from "../../src/lib/roles";
import { DATASET_VERSION } from "../../src/lib/types";
import { SOURCE_IDS } from "../../src/lib/types";
import type { DatasetStats, IndexEntry, Job, JobsFile, SourceId } from "../../src/lib/types";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

function loadPrevEnvelope(): JobsFile | null {
  const file = path.join(GENERATED_DIR, "jobs.json");
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as JobsFile;
    return Array.isArray(parsed.jobs) ? parsed : null;
  } catch {
    return null;
  }
}

function loadPrevStats(): DatasetStats | null {
  const file = path.join(GENERATED_DIR, "stats.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as DatasetStats;
  } catch {
    return null;
  }
}

function toIndexEntry(job: Job): IndexEntry {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companyLogoUrl: job.companyLogoUrl,
    seniority: job.seniority,
    domain: job.domain,
    countryIso2: job.location.countryIso2,
    countryName: job.location.countryName,
    region: job.location.region,
    remote: job.location.remote,
    visa: job.visa,
    workMode: job.workMode,
    officeDays: job.officeDays,
    roleType: job.roleType,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    variantCountries: job.variants,
    salaryMin: job.salary?.min,
    salaryMax: job.salary?.max,
    salaryCurrency: job.salary?.currency,
    salaryPeriod: job.salary?.period,
    salarySource: job.salary?.source,
    postedAt: job.postedAt,
    source: job.source,
  };
}

export function computeStats(jobs: Job[], generatedAt: string): DatasetStats {
  // every configured source appears, zeros included, so a dried-up pipeline
  // is visible in stats.json instead of silently disappearing
  const bySource: Record<string, number> = Object.fromEntries(SOURCE_IDS.map((id) => [id, 0]));
  const byRegion: Record<string, number> = {};
  const byVisa: Record<string, number> = {};
  const countries = new Set<string>();
  for (const job of jobs) {
    bySource[job.source] = (bySource[job.source] ?? 0) + 1;
    const region = job.location.remote && !job.location.countryIso2 ? "remote" : (job.location.region ?? "unknown");
    byRegion[region] = (byRegion[region] ?? 0) + 1;
    byVisa[job.visa] = (byVisa[job.visa] ?? 0) + 1;
    if (job.location.countryIso2) countries.add(job.location.countryIso2);
  }
  return { generatedAt, total: jobs.length, bySource, byRegion, byVisa, countries: countries.size };
}

async function main() {
  const args = process.argv.slice(2);
  const smoke = args.includes("--smoke");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? (onlyArg.split("=")[1] as SourceId) : null;

  const now = new Date().toISOString();
  console.log(`Ingest started at ${now}${smoke ? " (smoke mode)" : ""}`);

  const deps = { fetchJson: cachedFetchJson };
  const connectors = [
    greenhouseConnector(deps, { tokens: smoke ? ["stripe"] : GREENHOUSE_TOKENS }),
    workableConnector(deps, {
      queries: smoke ? ["CTO", "Director of Engineering"] : WORKABLE_QUERIES,
      locations: smoke ? ["United Arab Emirates"] : WORKABLE_LOCATIONS,
    }),
    arbeitnowConnector(deps, { pages: smoke ? 1 : ARBEITNOW_PAGES }),
    jobicyConnector(deps, { count: smoke ? 5 : JOBICY_COUNT, tags: smoke ? undefined : JOBICY_TAGS }),
    leverConnector(deps, { tokens: smoke ? ["netomi"] : LEVER_TOKENS, names: LEVER_COMPANY_NAMES }),
    ashbyConnector(deps, { tokens: smoke ? ["docker"] : ASHBY_TOKENS, names: ASHBY_COMPANY_NAMES }),
    himalayasConnector(deps, { pages: smoke ? 1 : HIMALAYAS_PAGES, queries: HIMALAYAS_QUERIES }),
    adzunaConnector(deps, {
      appId: process.env.ADZUNA_APP_ID ?? "",
      appKey: process.env.ADZUNA_APP_KEY ?? "",
      countries: smoke ? ["gb"] : ADZUNA_COUNTRIES,
      queries: smoke ? ["engineering director"] : ADZUNA_QUERIES,
      pages: 1,
    }),
  ].filter((connector) => !only || connector.id === only);

  const prevEnvelope = loadPrevEnvelope();
  const existing = new Map<string, Job>((prevEnvelope?.jobs ?? []).map((job) => [job.id, job]));
  const allJobs: Job[] = [];
  let dropped = 0;

  for (const connector of connectors) {
    const rawJobs = await connector.run();
    let kept = 0;
    for (const raw of rawJobs) {
      const priorJob = existing.get(stableId(raw.company, raw.title, raw.source, raw.externalId));
      const job = normalizeJob(raw, now, priorJob);
      if (!job) {
        dropped += 1;
        continue;
      }
      allJobs.push(job);
      kept += 1;
    }
    console.log(`[${connector.id}] ${rawJobs.length} fetched, ${kept} in scope`);
  }

  const deduped = dedupeJobs(allJobs).map((job) => stableUpdatedAt(job, existing));
  deduped.sort((a, b) => (a.postedAt === b.postedAt ? a.id.localeCompare(b.id) : a.postedAt < b.postedAt ? 1 : -1));

  if (shouldRunSanityGate({ smoke, only: Boolean(only), force: args.includes("--force") })) {
    const problems = datasetProblems(deduped, loadPrevStats());
    if (problems.length > 0) {
      for (const problem of problems) console.error(`[sanity] ${problem.rule}: ${problem.detail}`);
      throw new Error("Dataset sanity check failed; refusing to write. Re-run with --force to override.");
    }
  }

  // a quiet run whose content is byte-identical keeps the previous stamp so
  // the workflow's no-change check can actually fire and skip the commit
  const stamp =
    prevEnvelope && JSON.stringify(deduped) === JSON.stringify(prevEnvelope.jobs)
      ? prevEnvelope.generatedAt
      : now;

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  writeJsonAtomic(path.join(GENERATED_DIR, "jobs.json"), {
    version: DATASET_VERSION,
    generatedAt: stamp,
    jobs: deduped,
  });
  writeJsonAtomic(path.join(GENERATED_DIR, "index.json"), {
    version: DATASET_VERSION,
    generatedAt: stamp,
    jobs: deduped.map(toIndexEntry),
  });
  const stats = computeStats(deduped, stamp);
  writeJsonAtomic(path.join(GENERATED_DIR, "stats.json"), stats);
  writeJsonAtomic(path.join(GENERATED_DIR, "queries.json"), {
    generatedAt: stamp,
    queries: buildQueryMatrix().map((q) => q.phrase),
  });

  console.log(`Done: ${deduped.length} jobs (${dropped} out of scope), ${stats.countries} countries`);
  if (stamp !== now) console.log("Dataset unchanged; kept previous generatedAt");
  console.log("By source:", stats.bySource);
  console.log("By region:", stats.byRegion);
  console.log("By visa:", stats.byVisa);
}

main().catch((error) => {
  console.error("Ingest failed:", error);
  process.exit(1);
});
