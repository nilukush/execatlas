import fxData from "@/data/salary/fx.json";
import type { IndexEntry } from "./types";
import type { RegionId } from "./locations";

export interface JobFilters {
  query: string;
  region: RegionId | "all";
  country: string; // iso2 or "all"
  seniority: string; // "all" | Seniority
  visa: "all" | "yes" | "no" | "unknown";
  workMode: "all" | "remote" | "hybrid" | "onsite";
  roleType: string; // "all" | RoleType
  source: string; // "all" | SourceId
  sort: "newest" | "salary";
}

export const DEFAULT_FILTERS: JobFilters = {
  query: "",
  region: "all",
  country: "all",
  seniority: "all",
  visa: "all",
  workMode: "all",
  roleType: "all",
  source: "all",
  sort: "newest",
};

const FX_RATES = (fxData as { rates: Record<string, number> }).rates;

/** Converts an amount to USD using the vendored FX snapshot; 0 when unknown. */
export function toUsd(amount: number | undefined, currency: string | undefined): number {
  if (amount === undefined || !currency) return 0;
  const rate = FX_RATES[currency];
  if (!rate) return 0;
  return amount / rate;
}

/** Annualized USD value for ranking; monthly bands must compare against annual ones. */
function annualizedUsd(entry: IndexEntry): number {
  const usd = toUsd(entry.salaryMax, entry.salaryCurrency);
  return entry.salaryPeriod === "monthly" ? usd * 12 : usd;
}

function searchScore(entry: IndexEntry, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const title = entry.title.toLowerCase();
  const company = entry.company.toLowerCase();
  const place = `${entry.countryName ?? ""} ${entry.region ?? ""} ${(entry.variantCountries ?? [])
    .map((v) => v.countryName ?? "")
    .join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    let hit = 0;
    if (title.includes(token)) hit += 3;
    if (company.includes(token)) hit += 2;
    if (place.includes(token)) hit += 1.5;
    if (hit === 0) return 0; // every token must match somewhere
    score += hit;
  }
  return score;
}

/**
 * Roles whose posting date falls within the window before the reference
 * time. Powers the "+N this week" trend cue on the stats band; the dataset
 * generation time is the honest cutoff, not the build time.
 */
export function countPostedWithin(entries: IndexEntry[], days: number, now: number): number {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => {
    const posted = Date.parse(entry.postedAt);
    return !Number.isNaN(posted) && posted >= cutoff && posted <= now;
  }).length;
}

export function applyFilters(entries: IndexEntry[], filters: JobFilters): IndexEntry[] {
  const tokens = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const scored: Array<{ entry: IndexEntry; score: number }> = [];
  for (const entry of entries) {
    // a grouped role lives in several countries at once; every location fact
    // of the group satisfies the place filters, not just the primary's
    const regions = [entry.region, ...(entry.variantCountries ?? []).map((v) => v.region)];
    const countries = [entry.countryIso2, ...(entry.variantCountries ?? []).map((v) => v.countryIso2)];
    const remotes = [entry.remote, ...(entry.variantCountries ?? []).map((v) => v.remote)];
    if (filters.region !== "all") {
      if (filters.region === "remote") {
        if (!remotes.some(Boolean)) continue;
      } else if (!regions.includes(filters.region)) {
        continue;
      }
    }
    if (filters.country !== "all" && !countries.includes(filters.country)) continue;
    if (filters.seniority !== "all" && entry.seniority !== filters.seniority) continue;
    if (filters.visa !== "all" && entry.visa !== filters.visa) continue;
    if (filters.workMode !== "all" && entry.workMode !== filters.workMode) continue;
    if (filters.roleType !== "all" && (entry.roleType ?? "") !== filters.roleType) continue;
    if (filters.source !== "all" && entry.source !== filters.source) continue;

    const score = searchScore(entry, tokens);
    if (score === 0) continue;
    scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (filters.sort === "salary") {
      const usdA = annualizedUsd(a.entry);
      const usdB = annualizedUsd(b.entry);
      if (usdA !== usdB) return usdB - usdA;
    }
    if (a.score !== b.score) return b.score - a.score;
    return a.entry.postedAt === b.entry.postedAt
      ? a.entry.id.localeCompare(b.entry.id)
      : a.entry.postedAt < b.entry.postedAt
        ? 1
        : -1;
  });

  return scored.map((s) => s.entry);
}

export const PAGE_SIZE = 24;

/** Default catalog order for the static list pages: no filters, newest first. */
export function defaultOrder(entries: IndexEntry[]): IndexEntry[] {
  return applyFilters(entries, DEFAULT_FILTERS);
}

export function paginate(list: IndexEntry[], page: number): { slice: IndexEntry[]; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  return { slice: list.slice(start, start + PAGE_SIZE), pageCount };
}
