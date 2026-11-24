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
import { dedupeJobs, dedupeKey } from "./dedupe";
import { SOURCE_UNIT, carryOver } from "./carry";
import { datasetProblems, shouldRunSanityGate } from "./sanity";
import { writeJsonAtomic } from "./write";
import { buildQueryMatrix } from "../../src/lib/roles";
import { DATASET_VERSION } from "../../src/lib/types";
import { SOURCE_IDS } from "../../src/lib/types";
import type { SourceQuality } from "../../src/lib/types";
import type { DatasetStats, IndexEntry, Job, JobsFile, RawJob, SourceId } from "../../src/lib/types";

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
 * message passes withoutQueryString before it is stored (ruling R60): it
 * loses the query string of an http or https URL, the user and the password
 * of a URL of any scheme, and the value of a parameter named like a
 * credential. So no key a request sent in one of those shapes can reach the
 * stored report in stats.json, or the tracking issue through it. A header
 * line such as "Authorization: Bearer ..." is not masked, because no
 * connector sends one. The console is no part of it: a connector prints what
 * it prints.
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
    sources: job.sources,
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

/**
 * The previous records a run may judge tonight: those of the sources it
 * fetched. A run with --only=x never speaks for the records of another source.
 */
export function previousOfSources(previous: Job[], fetchedSources: string[]): Job[] {
  const fetched = new Set(fetchedSources);
  return previous.filter((job) => fetched.has(job.source));
}

/** The previous dataset by the two handles a raw job finds its stored record with: the id and the dedupe key. */
export interface PreviousIndex {
  byId: Map<string, Job>;
  byKey: Map<string, Job>;
}

export function indexPrevious(previous: Job[]): PreviousIndex {
  return {
    byId: new Map<string, Job>(previous.map((stored) => [stored.id, stored])),
    byKey: new Map<string, Job>(previous.map((stored) => [dedupeKey(stored), stored])),
  };
}

/**
 * The stored record a raw job continues tonight (ruling R61): the one under
 * its own id, else the one that shares the dedupe key of its normalization.
 * A merged record is stored under the id of its elder source, so its twin of
 * another source finds it by the key alone: the fresh role then takes the
 * stored id and first night, and a stored source tag is remembered for it.
 */
export function previousOfRaw(raw: RawJob, now: string, previous: PreviousIndex): Job | undefined {
  const own = previous.byId.get(stableIdForRaw(raw));
  if (own) return own;
  const normalized = normalizeJob(raw, now);
  return normalized ? previous.byKey.get(dedupeKey(normalized)) : undefined;
}

/** Carried roles alone, the sum of carriedBySource: grace roles are no carried roles (ruling R62). */
export function carriedCount(carriedBySource: Record<string, number>): number {
  return Object.values(carriedBySource).reduce((sum, count) => sum + count, 0);
}

/**
 * The lines a run prints about the roles it kept from the previous refresh
 * (ruling R62). Each counts its own kind: carried roles after failed feeds,
 * grace roles after a feed that no longer lists them.
 */
export function carryLines(
  carried: { carriedBySource: Record<string, number>; graceCount: number },
  failedFeeds: number
): string[] {
  const lines: string[] = [];
  if (failedFeeds > 0) {
    lines.push(
      `[carry] ${carriedCount(carried.carriedBySource)} roles kept from the previous refresh after ${failedFeeds} failed feeds`
    );
  }
  if (carried.graceCount > 0) {
    lines.push(`[grace] ${carried.graceCount} roles kept for two nights after leaving their feed`);
  }
  return lines;
}

/**
 * A source that fetched no raw job tonight while the previous dataset holds
 * a role of it answered with no roles (ruling R59). The report is a
 * transient failure of the whole source, so carryOver keeps its roles as it
 * keeps those of a failed feed. A source the run did not fetch has no entry
 * in `runs` and is not judged.
 */
export function emptyAnswers(runs: Array<{ id: SourceId; fetched: number }>, previous: Job[]): FeedFailure[] {
  const held = new Set(previous.map((job) => job.source));
  return runs
    .filter((run) => run.fetched === 0 && held.has(run.id))
    .map((run) => ({ source: run.id, unit: SOURCE_UNIT, transient: true, message: "the source answered with no roles" }));
}

/**
 * Whether an Arbeitnow visa feed failed transiently tonight. Its raw jobs
 * then come back untagged, and the stored source tag stands in for them.
 */
export function visaFeedFailed(failures: FeedFailure[]): boolean {
  return failures.some(
    (failure) => failure.transient && failure.source === "arbeitnow" && failure.unit.startsWith("visa-feed-")
  );
}

/**
 * What a run writes. A quiet night, one whose final list equals the previous
 * records with only lastSeenAt apart, keeps the previous stamp and records,
 * so the workflow's no-change check can fire and skip the commit (ruling R46).
 */
export function settleNight(
  finalJobs: Job[],
  previous: JobsFile | null,
  now: string
): { jobs: Job[]; generatedAt: string } {
  if (previous && JSON.stringify(apartFromLastSeen(finalJobs)) === JSON.stringify(apartFromLastSeen(previous.jobs))) {
    return { jobs: previous.jobs, generatedAt: previous.generatedAt };
  }
  return { jobs: finalJobs, generatedAt: now };
}

function apartFromLastSeen(jobs: Job[]): Job[] {
  return jobs.map((job) => {
    const copy = { ...job };
    delete copy.lastSeenAt;
    return copy;
  });
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
  const carriedTotal = carriedCount(carry?.carriedBySource ?? {});
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
      himalayasConnector(deps, { pages: smoke ? 1 : HIMALAYAS_PAGES, queries: HIMALAYAS_QUERIES, now }),
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
  const previous = indexPrevious(prevEnvelope?.jobs ?? []);
  const allJobs: Job[] = [];
  const runs: Array<{ id: SourceId; fetched: number }> = [];
  let dropped = 0;

  for (const connector of connectors) {
    const rawJobs = await connector.run();
    // the Arbeitnow visa tag lives in a feed of its own: when that feed
    // failed, its raw jobs come back untagged and the stored tag stands in
    const rememberSourceVisa = visaFeedFailed(failures);
    let kept = 0;
    for (const raw of rawJobs) {
      const priorJob = previousOfRaw(raw, now, previous);
      const job = normalizeJob(raw, now, priorJob, rememberSourceVisa ? { rememberSourceVisa: true } : undefined);
      if (!job) {
        dropped += 1;
        continue;
      }
      allJobs.push(job);
      kept += 1;
    }
    runs.push({ id: connector.id, fetched: rawJobs.length });
    console.log(`[${connector.id}] ${rawJobs.length} fetched, ${kept} in scope`);
  }

  // the first night of a source tag is carried from the stored merged record
  // before the stamp comparison, so an unchanged role stays byte-identical
  const fresh = dedupeJobs(allJobs).map((job) => stableJob(job, previous.byId));
  const judged = previousOfSources(prevEnvelope?.jobs ?? [], connectors.map((connector) => connector.id));
  for (const failure of emptyAnswers(runs, judged)) reportFailure(failure);
  const carried = carryOver({
    previous: judged,
    previousGeneratedAt: prevEnvelope?.generatedAt,
    fresh,
    failures,
    now,
  });
  const failedFeeds = new Set(failures.map((failure) => `${failure.source}/${failure.unit}`)).size;
  for (const line of carryLines(carried, failedFeeds)) console.log(line);
  // a carried or grace record is stored as it was, so it joins after the dedupe
  const finalJobs = [...fresh, ...carried.jobs];
  finalJobs.sort((a, b) => (a.postedAt === b.postedAt ? a.id.localeCompare(b.id) : a.postedAt < b.postedAt ? 1 : -1));

  if (shouldRunSanityGate({ smoke, only: Boolean(only), force: args.includes("--force") })) {
    const problems = datasetProblems(finalJobs, loadPrevStats(), carriedCount(carried.carriedBySource));
    if (problems.length > 0) {
      for (const problem of problems) console.error(`[sanity] ${problem.rule}: ${problem.detail}`);
      throw new Error("Dataset sanity check failed; refusing to write. Re-run with --force to override.");
    }
  }

  const { jobs, generatedAt: stamp } = settleNight(finalJobs, prevEnvelope, now);

  if (smoke) {
    console.log("Smoke mode: fetched and normalized only, nothing written.");
    return;
  }

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  writeJsonAtomic(path.join(GENERATED_DIR, "jobs.json"), {
    version: DATASET_VERSION,
    generatedAt: stamp,
    jobs,
  });
  writeJsonAtomic(path.join(GENERATED_DIR, "index.json"), {
    version: DATASET_VERSION,
    generatedAt: stamp,
    jobs: jobs.map(toIndexEntry),
  });
  const stats = computeStats(jobs, stamp, { carriedBySource: carried.carriedBySource, failedFeeds: failures });
  writeJsonAtomic(path.join(GENERATED_DIR, "stats.json"), stats);
  writeJsonAtomic(path.join(GENERATED_DIR, "queries.json"), {
    generatedAt: stamp,
    queries: buildQueryMatrix().map((q) => q.phrase),
  });

  console.log(`Done: ${jobs.length} jobs (${dropped} out of scope), ${stats.countries} countries`);
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
