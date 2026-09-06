import { SOURCE_IDS } from "../../src/lib/types";
import type { Job } from "../../src/lib/types";

function normalizeCompany(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bof\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

function dedupeKey(job: Job): string {
  const place = job.location.countryIso2 ?? (job.location.remote ? "remote" : job.location.region) ?? "remote";
  return `${normalizeCompany(job.company)}|${normalizeTitle(job.title)}|${place}`;
}

function richness(job: Job): number {
  return (
    job.requirements.length * 2 +
    job.blocks.length +
    (job.salary ? 5 : 0) +
    (job.companyLogoUrl ? 1 : 0) +
    Math.min(3, Math.floor(job.text.length / 2000))
  );
}

function sourceRank(job: Job): number {
  const index = SOURCE_IDS.indexOf(job.source);
  return index === -1 ? 99 : index;
}

function mergeJobs(a: Job, b: Job): Job {
  const primary = richness(a) !== richness(b) ? (richness(a) > richness(b) ? a : b) : sourceRank(a) <= sourceRank(b) ? a : b;
  const secondary = primary === a ? b : a;
  const sources = SOURCE_IDS.filter((id) => primary.sources.includes(id) || secondary.sources.includes(id));
  return {
    ...primary,
    sources,
    postedAt: primary.postedAt < secondary.postedAt ? primary.postedAt : secondary.postedAt,
    firstSeen: primary.firstSeen < secondary.firstSeen ? primary.firstSeen : secondary.firstSeen,
    visa: primary.visa !== "unknown" ? primary.visa : secondary.visa,
    salary: primary.salary ?? secondary.salary,
    requirements: primary.requirements.length >= secondary.requirements.length ? primary.requirements : secondary.requirements,
  };
}

/**
 * Merges the same real-world role found on multiple sources, keyed on
 * company, normalized title and place. The richer record wins; source list,
 * earliest dates and visa signal merge across duplicates.
 */
export function dedupeJobs(jobs: Job[]): Job[] {
  const byKey = new Map<string, Job>();
  for (const job of jobs) {
    const key = dedupeKey(job);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeJobs(existing, job) : job);
  }
  return [...byKey.values()];
}

export { dedupeKey };
