import crypto from "node:crypto";
import { classifyTitle } from "../../src/lib/roles";
import { resolveLocation } from "../../src/lib/locations";
import { parsePostingHtml } from "../../src/lib/jd";
import { detectVisa } from "../../src/lib/enrich/visa";
import { detectWorkMode } from "../../src/lib/enrich/workmode";
import { detectRoleType } from "../../src/lib/enrich/role-type";
import { parseStatedSalary, estimateSalary } from "../../src/lib/salary";
import type { Job, RawJob, SalaryBand } from "../../src/lib/types";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function stableId(company: string, title: string, source: string, externalId: string): string {
  const hash = crypto
    .createHash("sha1")
    .update(`${source}:${externalId}`)
    .digest("hex")
    .slice(0, 6);
  return `${slugify(company)}-${slugify(title)}-${hash}`;
}

/**
 * Turns a connector's raw job into a canonical, enriched Job record.
 * Returns null when the job falls outside the product scope: leadership
 * titles only, and locations within the six supported regions (or remote).
 */
export function normalizeJob(raw: RawJob, now: string, existing?: Job): Job | null {
  const classification = classifyTitle(raw.title);
  if (!classification) return null;

  const location = resolveLocation(raw.locationRaw);
  if (!location || (!location.country && !location.region && !location.remote)) return null;

  const parsed = parsePostingHtml(raw.descriptionHtml ?? "");
  const visa = detectVisa(parsed.text);
  const work = detectWorkMode(parsed.text, raw.remoteHint === true);
  const roleType = detectRoleType(parsed.text, raw.employmentHint);

  let salary: SalaryBand | null = null;
  if (raw.salaryHint) {
    salary = { ...raw.salaryHint, source: "stated" };
  } else {
    const stated = parseStatedSalary(parsed.text);
    if (stated) {
      salary = { ...stated, source: "stated" };
    } else if (location.country) {
      salary = estimateSalary(location.country.iso3, classification.domain);
    }
  }

  return {
    id: existing?.id ?? stableId(raw.company, raw.title, raw.source, raw.externalId),
    title: raw.title.trim(),
    company: raw.company.trim(),
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
    },
    seniority: classification.seniority,
    domain: classification.domain,
    visa,
    workMode: work.mode,
    officeDays: work.officeDays,
    roleType,
    salary,
    postedAt: raw.postedAt ?? existing?.postedAt ?? now,
    firstSeen: existing?.firstSeen ?? now,
    updatedAt: now,
    posterName: raw.posterName ?? undefined,
    posterUrl: raw.posterUrl ?? undefined,
  };
}
