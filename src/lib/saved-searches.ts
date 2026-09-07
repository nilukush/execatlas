/**
 * Saved searches live entirely on the user's device: the full filter state
 * plus the ids of the roles it matched when last viewed. "New" counts compare
 * the ids against the current dataset, so a refreshed dataset shows fresh
 * roles without any server, account or push infrastructure.
 */

import { applyFilters, type JobFilters } from "./search";
import type { IndexEntry } from "./types";
import type { RegionId } from "./locations";

export interface SavedSearch {
  id: string;
  question: string;
  filters: JobFilters;
  createdAt: string;
  seenIds: string[];
}

export function createSavedSearch(question: string, filters: JobFilters, id: string): SavedSearch {
  return { id, question, filters, createdAt: new Date().toISOString(), seenIds: [] };
}

/** Current matches of a saved search that the user has not seen yet. */
export function newMatches(saved: SavedSearch, entries: IndexEntry[]): IndexEntry[] {
  const seen = new Set(saved.seenIds);
  return applyFilters(entries, saved.filters).filter((e) => !seen.has(e.id));
}

/** Records the current match ids as seen, clearing the new badge. */
export function markSeen(saved: SavedSearch, entries: IndexEntry[]): SavedSearch {
  return {
    ...saved,
    seenIds: applyFilters(entries, saved.filters).map((e) => e.id),
  };
}

const REGION_VALUES = new Set<string>([
  "all",
  "india",
  "middle-east",
  "southeast-asia",
  "north-africa",
  "europe",
  "north-america",
  "remote",
]);
const SENIORITY_VALUES = new Set(["all", "cto", "vp", "avp", "director", "head"]);
const VISA_VALUES = new Set(["all", "yes", "no", "unknown"]);
const WORKMODE_VALUES = new Set(["all", "remote", "hybrid", "onsite"]);
const ROLETYPE_VALUES = new Set([
  "all",
  "permanent",
  "contract",
  "freelance",
  "temporary",
  "part-time",
  "full-time",
  "interim",
]);
const SOURCE_VALUES = new Set(["all", "greenhouse", "workable", "arbeitnow", "jobicy"]);
const SORT_VALUES = new Set(["newest", "salary"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): unknown {
  return typeof v === "string" ? v : undefined;
}

function validFilters(v: unknown): v is JobFilters {
  if (!isObject(v)) return false;
  return (
    typeof v.query === "string" &&
    REGION_VALUES.has(v.region as string) &&
    (v.country === "all" || /^[A-Z]{2}$/.test(v.country as string)) &&
    SENIORITY_VALUES.has(v.seniority as string) &&
    VISA_VALUES.has(v.visa as string) &&
    WORKMODE_VALUES.has(v.workMode as string) &&
    ROLETYPE_VALUES.has(v.roleType as string) &&
    SOURCE_VALUES.has(v.source as string) &&
    SORT_VALUES.has(v.sort as string)
  );
}

function validSaved(v: unknown): v is SavedSearch {
  if (!isObject(v)) return false;
  const seenOk =
    v.seenIds === undefined ||
    (Array.isArray(v.seenIds) && v.seenIds.every((id) => typeof id === "string"));
  return (
    typeof v.id === "string" &&
    v.id !== "" &&
    typeof v.question === "string" &&
    validFilters(v.filters) &&
    seenOk &&
    (v.createdAt === undefined || typeof v.createdAt === "string")
  );
}

/** Parses localStorage content; corrupt or outdated entries are dropped. */
export function parseSavedSearches(raw: string | null): SavedSearch[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(validSaved)
    .map((s) => ({ ...s, seenIds: s.seenIds ?? [], createdAt: s.createdAt ?? "" }));
}

export function serializeSavedSearches(list: SavedSearch[]): string {
  return JSON.stringify(list);
}
