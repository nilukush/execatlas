import crypto from "node:crypto";
import { classifyTitle } from "../../src/lib/roles";
import { resolveLocation } from "../../src/lib/locations";
import { parsePostingHtml } from "../../src/lib/jd";
import { detectRelocation, detectVisa, relocationEvidence, visaEvidence } from "../../src/lib/enrich/visa";
import { detectWorkMode } from "../../src/lib/enrich/workmode";
import { detectRoleType } from "../../src/lib/enrich/role-type";
import { extractExperience } from "../../src/lib/enrich/experience";
import { parseStatedSalary, estimateSalary, isPlausibleBand } from "../../src/lib/salary";
import { MAX_CARRIED_NIGHTS, postedTooLongAgo } from "./carry";
import type { Job, RawJob, SalaryBand } from "../../src/lib/types";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function stableId(company: string, title: string, source: string, externalId: string): string {
  const hash = crypto
    .createHash("sha1")
    .update(`${source}:${externalId}`)
    .digest("hex")
    .slice(0, 6);
  return `${slugify(company)}-${slugify(title)}-${hash}`;
}

const BASIC_ENTITIES: Array<[RegExp, string]> = [
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, "\""],
  [/&#39;|&apos;/g, "'"],
];

/** Workable occasionally double-escapes titles; decode the common entities. */
function decodeEntities(value: string): string {
  let out = value;
  for (const [pattern, replacement] of BASIC_ENTITIES) out = out.replace(pattern, replacement);
  // numeric entities, including ones the named pass just unescaped
  for (let pass = 0; pass < 2; pass += 1) {
    out = out.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  }
  return out.replace(/\u00a0/g, " ");
}

function isWebUrl(value: string | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isValidCurrency(code: string | undefined): code is string {
  return typeof code === "string" && /^[A-Z]{3}$/.test(code);
}

/**
 * The date of a source tag (ruling R16): the first night the tag was seen.
 * The previous record's date is kept when that record already stood on the
 * tag with a date, so a tagged role stays byte-identical on a quiet night.
 */
function tagDate(previous: Job | undefined, tonight: string | undefined): string | undefined {
  return previous?.visaBasis === "source" && previous.visaDeclaredAt ? previous.visaDeclaredAt : tonight;
}

/**
 * The visa signal with the facts behind it. A refusal or an affirmation in
 * the posting beats a source tag (Arbeitnow visa filter); a tag stands on
 * its own only when the posting has no visa words, and is dated with the
 * first night the tag was seen. When the tagged feed failed tonight the
 * raw job carries no tag: the stored tag then stands in for it and counts
 * its nights on the carry counter, three at most (ruling R44).
 */
function visaSignal(
  text: string,
  tagged: boolean,
  now: string,
  previous: Job | undefined,
  rememberSourceVisa: boolean
): Pick<Job, "visa" | "visaBasis" | "visaEvidence" | "visaDeclaredAt" | "carriedNights"> {
  const visa = detectVisa(text);
  if (visa !== "unknown") {
    return { visa, visaBasis: "posting", visaEvidence: visaEvidence(text), visaDeclaredAt: undefined };
  }
  const rememberedNights = previous?.carriedNights ?? 0;
  // a tag the source has not confirmed for three nights is not remembered on the fourth
  const remembered =
    rememberSourceVisa &&
    previous?.visaBasis === "source" &&
    previous.visa === "yes" &&
    rememberedNights < MAX_CARRIED_NIGHTS;
  if (tagged || remembered) {
    return {
      visa: "yes",
      visaBasis: "source",
      visaEvidence: null,
      visaDeclaredAt: tagDate(previous, now),
      // a remembered tag counts its night on the carry counter; a tag the feed confirms counts none
      ...(remembered && !tagged ? { carriedNights: rememberedNights + 1 } : {}),
    };
  }
  return { visa, visaBasis: undefined, visaEvidence: null, visaDeclaredAt: undefined };
}

/** The company and title as every later step reads them: decoded, then trimmed. */
function decodedNames(raw: RawJob): { company: string; title: string } {
  return { company: decodeEntities(raw.company).trim(), title: decodeEntities(raw.title).trim() };
}

/**
 * Turns a connector's raw job into a canonical, enriched Job record.
 * Returns null when the job falls outside the product scope: leadership
 * titles only, locations within the six supported regions (or remote),
 * and a plain web apply URL, and a posting dated within the last 365 days.
 * `rememberSourceVisa` keeps a stored source tag on a night the tagged feed
 * failed.
 */
export function normalizeJob(
  raw: RawJob,
  now: string,
  existing?: Job,
  options: { rememberSourceVisa?: boolean } = {}
): Job | null {
  // decode before anything downstream reads the title or company: the
  // classifier, ids and dedupe keys must all see clean text
  const { company, title } = decodedNames(raw);
  const classification = classifyTitle(title);
  if (!classification) return null;
  if (!isWebUrl(raw.applyUrl)) return null;
  // a role posted more than a year ago is out of scope, whatever its feed still lists
  const postedAt = raw.postedAt ?? existing?.postedAt ?? now;
  if (postedTooLongAgo(postedAt, now)) return null;
  if (!isWebUrl(raw.sourceUrl)) raw = { ...raw, sourceUrl: raw.applyUrl };
  if (!isWebUrl(raw.companyLogoUrl)) raw = { ...raw, companyLogoUrl: undefined };
  const salaryHint =
    raw.salaryHint && isValidCurrency(raw.salaryHint.currency) ? raw.salaryHint : null;

  const location = resolveLocation(raw.locationRaw);
  if (!location || (!location.country && !location.region && !location.remote)) return null;

  const parsed = parsePostingHtml(raw.descriptionHtml ?? "");
  const relocation = detectRelocation(parsed.text);
  const work = detectWorkMode(parsed.text, raw.remoteHint === true);
  const roleType = detectRoleType(parsed.text, raw.employmentHint);
  const experience = extractExperience(parsed.text, parsed.requirements.join("\n"));

  // a band that is not plausible pay falls through to the estimate, as if nothing was stated (ruling R39)
  const estimated = (): SalaryBand | null =>
    location.country ? estimateSalary(location.country.iso3, classification.domain) : null;
  let salary: SalaryBand | null;
  if (salaryHint) {
    const stated: SalaryBand = { ...salaryHint, source: "stated" };
    salary = isPlausibleBand(stated) ? stated : estimated();
  } else {
    const fromText = parseStatedSalary(parsed.text);
    const stated: SalaryBand | null = fromText ? { ...fromText, source: "stated" } : null;
    salary = stated && isPlausibleBand(stated) ? stated : estimated();
  }

  const job: Job = {
    id: existing?.id ?? stableId(company, title, raw.source, raw.externalId),
    title,
    company,
    companyLogoUrl: raw.companyLogoUrl,
    applyUrl: raw.applyUrl,
    sourceUrl: raw.sourceUrl,
    source: raw.source,
    sources: [raw.source],
    text: parsed.text,
    blocks: parsed.blocks,
    requirements: parsed.requirements,
    location: {
      countryIso2: location.country?.iso2,
      countryName: location.country?.name,
      region: location.country ? location.country.region : (location.region as Job["location"]["region"]),
      remote: location.remote,
      raw: raw.locationRaw,
      // an empty list must stay absent: its presence marks a restricted role
      ...(raw.locationRestrictions?.length ? { restrictions: raw.locationRestrictions } : {}),
    },
    seniority: classification.seniority,
    domain: classification.domain,
    ...visaSignal(parsed.text, raw.visaHint === true, now, existing, options.rememberSourceVisa === true),
    relocation,
    relocationEvidence: relocationEvidence(parsed.text),
    workMode: work.mode,
    officeDays: work.officeDays,
    roleType,
    experienceMin: experience?.min,
    experienceMax: experience?.max,
    salary,
    postedAt,
    firstSeen: existing?.firstSeen ?? now,
    updatedAt: now,
    posterName: raw.posterName ?? undefined,
    posterUrl: raw.posterUrl ?? undefined,
    feedUnit: raw.feedUnit,
    sourceHome: raw.sourceHome,
    // the run time of every refresh whose feed listed the role
    lastSeenAt: now,
    ...(raw.expiresAt ? { expiresAt: raw.expiresAt } : {}),
  };

  // a job whose content did not change keeps its previous updatedAt so a
  // quiet ingest can produce a byte-identical dataset and skip the commit
  if (existing && contentSignature(job) === contentSignature(existing)) {
    return { ...job, updatedAt: existing.updatedAt };
  }
  return job;
}

/**
 * Post-dedupe guard for merged records: a raw re-normalized against a
 * multi-source record cannot match per-raw (its sources array is shorter),
 * so the comparison runs again here against the stored merged record.
 */
export function stableUpdatedAt(job: Job, prevById: Map<string, Job>): Job {
  const prev = prevById.get(job.id);
  if (prev && contentSignature(job) === contentSignature(prev)) {
    return { ...job, updatedAt: prev.updatedAt };
  }
  return job;
}

/**
 * Post-dedupe carry for merged records (ruling R16). run.ts looks a previous
 * record up by the raw job's own id, while a merged record is stored under
 * the elder id, so a tag on the other twin cannot keep its date inside
 * normalizeJob. The merged id is known only here. It runs before
 * stableUpdatedAt, whose comparison must see the kept date.
 */
export function stableVisaDeclaredAt(job: Job, prevById: Map<string, Job>): Job {
  if (job.visaBasis !== "source") return job;
  const visaDeclaredAt = tagDate(prevById.get(job.id), job.visaDeclaredAt);
  return visaDeclaredAt === job.visaDeclaredAt ? job : { ...job, visaDeclaredAt };
}

/**
 * The key that finds a raw job's previous record (ruling R34). It is built
 * from the decoded company and title, exactly as the stored id is, so a
 * title with an entity finds its record and keeps its first night.
 */
export function stableIdForRaw(raw: RawJob): string {
  const { company, title } = decodedNames(raw);
  return stableId(company, title, raw.source, raw.externalId);
}

/**
 * The post-dedupe stability step in its one correct order (ruling R34): the
 * kept tag date must be in place before the content comparison, or a merged
 * record whose date is only restored afterwards reads as changed.
 */
export function stableJob(job: Job, prevById: Map<string, Job>): Job {
  return stableUpdatedAt(stableVisaDeclaredAt(job, prevById), prevById);
}

// the feed, the last-seen stamp and the night counters say when a role was seen, not what it is
const NOT_CONTENT = ["updatedAt", "firstSeen", "feedUnit", "lastSeenAt", "carriedNights", "absentNights"];

function contentSignature(job: Job): string {
  return JSON.stringify(job, Object.keys(job).filter((k) => !NOT_CONTENT.includes(k)).sort());
}
