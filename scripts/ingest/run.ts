import fs from "node:fs";
import path from "node:path";
import { cachedFetchJson } from "./http";
import {
  GREENHOUSE_TOKENS,
  WORKABLE_LOCATIONS,
  WORKABLE_QUERIES,
  ARBEITNOW_PAGES,
  JOBICY_COUNT,
} from "./config";
import { greenhouseConnector } from "./connectors/greenhouse";
import { workableConnector } from "./connectors/workable";
import { arbeitnowConnector } from "./connectors/arbeitnow";
import { jobicyConnector } from "./connectors/jobicy";
import { normalizeJob } from "./normalize";
import { dedupeJobs } from "./dedupe";
import { buildQueryMatrix } from "../../src/lib/roles";
import type { DatasetStats, IndexEntry, Job, SourceId } from "../../src/lib/types";

const GENERATED_DIR = path.join(process.cwd(), "data", "generated");

async function loadExisting(): Promise<Map<string, Job>> {
  const file = path.join(GENERATED_DIR, "jobs.json");
  if (!fs.existsSync(file)) return new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { jobs?: Job[] };
    return new Map((parsed.jobs ?? []).map((job) => [job.id, job]));
  } catch {
    return new Map();
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
    salaryMin: job.salary?.min,
    salaryMax: job.salary?.max,
    salaryCurrency: job.salary?.currency,
    salaryPeriod: job.salary?.period,
    salarySource: job.salary?.source,
    postedAt: job.postedAt,
    source: job.source,
  };
}

function computeStats(jobs: Job[], generatedAt: string): DatasetStats {
  const bySource: Record<string, number> = {};
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
    jobicyConnector(deps, { count: smoke ? 5 : JOBICY_COUNT }),
  ].filter((connector) => !only || connector.id === only);

  const existing = await loadExisting();
  const allJobs: Job[] = [];
  let dropped = 0;

  for (const connector of connectors) {
    const rawJobs = await connector.run();
    let kept = 0;
    for (const raw of rawJobs) {
      const job = normalizeJob(raw, now);
      if (!job) {
        dropped += 1;
        continue;
      }
      const priorJob = existing.get(job.id);
      const finalJob = priorJob ? normalizeJob(raw, now, priorJob) ?? job : job;
      allJobs.push(finalJob);
      kept += 1;
    }
    console.log(`[${connector.id}] ${rawJobs.length} fetched, ${kept} in scope`);
  }

  const deduped = dedupeJobs(allJobs);
  deduped.sort((a, b) => (a.postedAt === b.postedAt ? a.id.localeCompare(b.id) : a.postedAt < b.postedAt ? 1 : -1));

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(GENERATED_DIR, "jobs.json"),
    JSON.stringify({ generatedAt: now, jobs: deduped }, null, 2)
  );
  fs.writeFileSync(
    path.join(GENERATED_DIR, "index.json"),
    JSON.stringify({ generatedAt: now, jobs: deduped.map(toIndexEntry) }, null, 2)
  );
  const stats = computeStats(deduped, now);
  fs.writeFileSync(path.join(GENERATED_DIR, "stats.json"), JSON.stringify(stats, null, 2));
  fs.writeFileSync(
    path.join(GENERATED_DIR, "queries.json"),
    JSON.stringify({ generatedAt: now, queries: buildQueryMatrix().map((q) => q.phrase) }, null, 2)
  );

  console.log(`Done: ${deduped.length} jobs (${dropped} out of scope), ${stats.countries} countries`);
  console.log("By source:", stats.bySource);
  console.log("By region:", stats.byRegion);
  console.log("By visa:", stats.byVisa);
}

main().catch((error) => {
  console.error("Ingest failed:", error);
  process.exit(1);
});
