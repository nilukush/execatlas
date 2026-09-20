import { SOURCE_IDS } from "../../src/lib/types";
import type { Job, JobVariant } from "../../src/lib/types";

/** Postings this far apart in time are separate hires, not a country batch. */
const VARIANT_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  // country-qualified remote postings of one role ("Remote - US" vs "Remote")
  // are the same job; remote collapses the place entirely
  const place = job.location.remote
    ? "remote"
    : (job.location.countryIso2 ?? job.location.region ?? "remote");
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
  // pin the merged record's id and firstSeen to whichever source saw it first,
  // so a richness flip between runs does not re-key the job
  const elder = a.firstSeen <= b.firstSeen ? a : b;
  // remote twins merge on one key; the country-qualified location is the more
  // specific fact and must survive even when the countryless record is richer
  const location =
    primary.location.remote &&
    !primary.location.countryIso2 &&
    secondary.location.remote &&
    secondary.location.countryIso2
      ? secondary.location
      : primary.location;
  return {
    ...primary,
    location,
    id: elder.id,
    firstSeen: elder.firstSeen,
    sources,
    postedAt: primary.postedAt < secondary.postedAt ? primary.postedAt : secondary.postedAt,
    visa: primary.visa !== "unknown" ? primary.visa : secondary.visa,
    salary: primary.salary ?? secondary.salary,
    experienceMin: primary.experienceMin ?? secondary.experienceMin,
    experienceMax: primary.experienceMax ?? secondary.experienceMax,
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
  return groupCountryVariants([...byKey.values()]);
}

/**
 * Employers on Workable post the same role once per country as a batch:
 * near-identical timestamps and byte-identical descriptions, one apply URL
 * per country. After the place-key merge, same-source entries sharing
 * company, normalized title, posting window and description collapse into
 * one role: the richest survives as primary, the others become variants
 * with their own apply URL so no posting is lost. Genuinely distinct
 * requisitions (different descriptions) always stay separate.
 */
function groupCountryVariants(jobs: Job[]): Job[] {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const key = `${job.source}|${normalizeCompany(job.company)}|${normalizeTitle(job.title)}`;
    const list = groups.get(key) ?? [];
    list.push(job);
    groups.set(key, list);
  }

  const out: Job[] = [];
  for (const list of groups.values()) {
    const clusters: Job[][] = [];
    for (const job of [...list].sort((a, b) => (a.postedAt < b.postedAt ? -1 : 1))) {
      const cluster = clusters.find(
        (c) =>
          Math.abs(Date.parse(c[0].postedAt) - Date.parse(job.postedAt)) <= VARIANT_WINDOW_MS &&
          c[0].text === job.text
      );
      if (cluster) cluster.push(job);
      else clusters.push([job]);
    }
    for (const cluster of clusters) {
      out.push(cluster.length > 1 ? collapseCluster(cluster) : cluster[0]);
    }
  }
  return out;
}

function collapseCluster(cluster: Job[]): Job {
  const [primary, ...rest] = [...cluster].sort(
    (a, b) => richness(b) - richness(a) || sourceRank(a) - sourceRank(b) || a.id.localeCompare(b.id)
  );
  // every distinct posting survives: same country can still mean two posts
  // (a remote-qualified page and an office page), so the apply URL decides
  const others = rest
    .filter((job) => job.applyUrl !== primary.applyUrl)
    .map<JobVariant>((job) => ({
      countryIso2: job.location.countryIso2,
      countryName: job.location.countryName,
      region: job.location.region,
      remote: job.location.remote,
      applyUrl: job.applyUrl,
    }))
    .sort((a, b) => (a.countryName ?? "").localeCompare(b.countryName ?? ""));
  const visa = primary.visa !== "unknown"
    ? primary.visa
    : others.length > 0 && rest.some((job) => job.visa !== "unknown")
      ? (rest.find((job) => job.visa !== "unknown")!.visa)
      : "unknown";
  // the group is one role seen across countries: earliest facts win, as in
  // mergeJobs, so primary churn cannot reset freshness or first-seen
  const elder = cluster.reduce((a, b) => (a.firstSeen <= b.firstSeen ? a : b));
  const earliestPostedAt = cluster.reduce((a, b) => (a.postedAt <= b.postedAt ? a : b)).postedAt;
  return {
    ...primary,
    visa,
    salary: primary.salary ?? rest.find((job) => job.salary)?.salary ?? null,
    postedAt: earliestPostedAt,
    firstSeen: elder.firstSeen,
    variants: others.length > 0 ? others : undefined,
  };
}

export { dedupeKey };
