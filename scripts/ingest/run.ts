import fs from "node:fs";
import path from "node:path";
import { cachedFetchJson, withoutQueryString } from "./http";
import type { FeedFailure, FetchDeps } from "./http";
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
import { normalizeJob, stableIdForRaw, stableJob } from "./normalize";
import { dedupeJobs } from "./dedupe";
import { carryOver } from "./carry";
import { datasetProblems, shouldRunSanityGate } from "./sanity";
import { writeJsonAtomic } from "./write";
import { buildQueryMatrix } from "../../src/lib/roles";
import { DATASET_VERSION } from "../../src/lib/types";
import { SOURCE_IDS } from "../../src/lib/types";
import type { SourceQuality } from "../../src/lib/types";
import type { DatasetStats, IndexEntry, Job, JobsFile, SourceId } from "../../src/lib/types";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

// Smoke runs once wrote their tiny dataset over the committed files and a
// careless git add shipped it. Smoke mode now stops before writing at all:
// it fetches, normalizes and reports, then exits (issue 38).

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

/**
 * Where every failed feed lands, and the only way into the failure list. A
 * message loses the query string of every http and https URL it holds before
 * it is stored, so no key a request sent can reach stats.json, the console
 * or the tracking issue.
 */
export function failureCollector(): { failures: FeedFailure[]; reportFailure: (failure: FeedFailure) => void } {
  const failures: FeedFailure[] = [];
  return {
    failures,
    reportFailure: (failure) => {
      failures.push({ ...failure, message: withoutQueryString(failure.message) });
    },
  };
}

export function toIndexEntry(job: Job): IndexEntry {
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
    visaBasis: job.visaBasis,
    relocation: job.relocation,
    // absent, never an empty list: only its presence marks a restricted role
    locationRestrictions: job.location.restrictions,
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
    sourceHome: job.sourceHome,
  };
}

/**
 * The connectors a run fetches: all of them, or the one a --only id names.
 * A single-source run skips the sanity gate, so an id that matches nothing
 * must stop the run before it writes a dataset without any source (ruling R5).
 */
export function selectConnectors<T extends { id: string }>(all: T[], only: string | null): T[] {
  if (only === null) return all;
  const selected = all.filter((connector) => connector.id === only);
  if (selected.length === 0) {
    throw new Error(`--only=${only} matches no connector (known: ${all.map((connector) => connector.id).join(", ")})`);
  }
  return selected;
}

export function computeStats(
  jobs: Job[],
  generatedAt: string,
  carry?: { carriedBySource: Record<string, number>; failedFeeds: NonNullable<DatasetStats["failedFeeds"]> }
): DatasetStats {
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
  // source scorecard: volume, marginal contribution (exclusive), signal
  // richness and freshness, so source quality is measured nightly, not guessed
  const bySourceQuality: Record<string, SourceQuality> = {};
  for (const source of SOURCE_IDS) {
    const mine = jobs.filter((job) => job.source === source);
    const ages = mine
      .map((job) => Math.floor((Date.parse(generatedAt) - Date.parse(job.postedAt)) / 86400000))
      .filter((age) => Number.isFinite(age) && age >= 0)
      .sort((a, b) => a - b);
    bySourceQuality[source] = {
      kept: mine.length,
      exclusive: mine.filter((job) => job.sources.length === 1).length,
      visaKnown: mine.filter((job) => job.visa !== "unknown").length,
      salaryStated: mine.filter((job) => job.salary?.source === "stated").length,
      medianPostedAgeDays: ages.length > 0 ? ages[Math.floor(ages.length / 2)] : 0,
    };
  }
  const carriedTotal = Object.values(carry?.carriedBySource ?? {}).reduce((sum, count) => sum + count, 0);
  return {
    bySourceQuality,
    generatedAt,
    total: jobs.length,
    bySource,
    byRegion,
    byVisa,
    countries: countries.size,
    ...(carry ? { carried: { total: carriedTotal, bySource: carry.carriedBySource }, failedFeeds: carry.failedFeeds } : {}),
  };
}

async function main() {
  // local runs read .env.local when present; real environment variables win
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // no .env.local (CI, fresh clones): nothing to load
  }

  const args = process.argv.slice(2);
  const smoke = args.includes("--smoke");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? (onlyArg.split("=")[1] as SourceId) : null;

  const now = new Date().toISOString();
  console.log(`Ingest started at ${now}${smoke ? " (smoke mode)" : ""}`);

  // every failed feed lands here: what it holds decides what is carried tonight
  const { failures, reportFailure } = failureCollector();
  const deps: FetchDeps = { fetchJson: cachedFetchJson, reportFailure };
  const connectors = selectConnectors(
    [
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
    ],
    only
  );

  const prevEnvelope = loadPrevEnvelope();
  const existing = new Map<string, Job>((prevEnvelope?.jobs ?? []).map((job) => [job.id, job]));
  const allJobs: Job[] = [];
  let dropped = 0;

  for (const connector of connectors) {
    const rawJobs = await connector.run();
    // the Arbeitnow visa tag lives in a feed of its own: when that feed
    // failed, its raw jobs come back untagged and the stored tag stands in
    const rememberSourceVisa = failures.some(
      (failure) => failure.source === "arbeitnow" && failure.unit.startsWith("visa-feed-")
    );
    let kept = 0;
    for (const raw of rawJobs) {
      const priorJob = existing.get(stableIdForRaw(raw));
      const job = normalizeJob(raw, now, priorJob, rememberSourceVisa ? { rememberSourceVisa: true } : undefined);
      if (!job) {
        dropped += 1;
        continue;
      }
      allJobs.push(job);
      kept += 1;
    }
    console.log(`[${connector.id}] ${rawJobs.length} fetched, ${kept} in scope`);
  }

  // the first night of a source tag is carried from the stored merged record
  // before the stamp comparison, so an unchanged role stays byte-identical
  const fresh = dedupeJobs(allJobs).map((job) => stableJob(job, existing));
  const carried = carryOver({
    previous: prevEnvelope?.jobs ?? [],
    previousGeneratedAt: prevEnvelope?.generatedAt,
    fresh,
    failures,
  });
  const failedFeeds = new Set(failures.map((failure) => `${failure.source}/${failure.unit}`)).size;
  if (failedFeeds > 0) {
    console.log(`[carry] ${carried.jobs.length} roles kept from the previous refresh after ${failedFeeds} failed feeds`);
  }
  // a carried record is stored as it was, so it joins after the dedupe
  const finalJobs = [...fresh, ...carried.jobs];
  finalJobs.sort((a, b) => (a.postedAt === b.postedAt ? a.id.localeCompare(b.id) : a.postedAt < b.postedAt ? 1 : -1));

  if (shouldRunSanityGate({ smoke, only: Boolean(only), force: args.includes("--force") })) {
    const problems = datasetProblems(finalJobs, loadPrevStats(), carried.jobs.length);
    if (problems.length > 0) {
      for (const problem of problems) console.error(`[sanity] ${problem.rule}: ${problem.detail}`);
      throw new Error("Dataset sanity check failed; refusing to write. Re-run with --force to override.");
    }
  }

  // a quiet run whose content is byte-identical keeps the previous stamp so
  // the workflow's no-change check can actually fire and skip the commit
  const stamp =
    prevEnvelope && JSON.stringify(finalJobs) === JSON.stringify(prevEnvelope.jobs)
      ? prevEnvelope.generatedAt
      : now;

  if (smoke) {
    console.log("Smoke mode: fetched and normalized only, nothing written.");
    return;
  }

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  writeJsonAtomic(path.join(GENERATED_DIR, "jobs.json"), {
    version: DATASET_VERSION,
    generatedAt: stamp,
    jobs: finalJobs,
  });
  writeJsonAtomic(path.join(GENERATED_DIR, "index.json"), {
    version: DATASET_VERSION,
    generatedAt: stamp,
    jobs: finalJobs.map(toIndexEntry),
  });
  const stats = computeStats(finalJobs, stamp, { carriedBySource: carried.carriedBySource, failedFeeds: failures });
  writeJsonAtomic(path.join(GENERATED_DIR, "stats.json"), stats);
  writeJsonAtomic(path.join(GENERATED_DIR, "queries.json"), {
    generatedAt: stamp,
    queries: buildQueryMatrix().map((q) => q.phrase),
  });

  console.log(`Done: ${finalJobs.length} jobs (${dropped} out of scope), ${stats.countries} countries`);
  if (stamp !== now) console.log("Dataset unchanged; kept previous generatedAt");
  console.log("By source:", stats.bySource);
  console.log("By region:", stats.byRegion);
  console.log("By visa:", stats.byVisa);
}

// importing this module (the test suite does) must never start a pipeline
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? "")) {
  main().catch((error) => {
    console.error("Ingest failed:", error);
    process.exit(1);
  });
}
