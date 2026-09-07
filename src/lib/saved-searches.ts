/**
 * Saved searches live entirely on the user's device: a filter intent plus the
 * ids of the roles it matched when last viewed. "New" counts compare the ids
 * against the current dataset, so a refreshed dataset shows fresh roles
 * without any server, account or push infrastructure.
 */

import type { QuestionIntent } from "./ask";
import { intentFilters } from "./ask";
import { applyFilters } from "./search";
import type { IndexEntry } from "./types";
import type { RegionId } from "./locations";

export interface SavedSearch {
  id: string;
  question: string;
  intent: QuestionIntent;
  createdAt: string;
  seenIds: string[];
}

export function createSavedSearch(
  question: string,
  intent: QuestionIntent,
  id: string
): SavedSearch {
  return { id, question, intent, createdAt: new Date().toISOString(), seenIds: [] };
}

/** Current matches of a saved search that the user has not seen yet. */
export function newMatches(saved: SavedSearch, entries: IndexEntry[]): IndexEntry[] {
  const seen = new Set(saved.seenIds);
  return applyFilters(entries, intentFilters(saved.intent)).filter((e) => !seen.has(e.id));
}

/** Records the current match ids as seen, clearing the new badge. */
export function markSeen(saved: SavedSearch, entries: IndexEntry[]): SavedSearch {
  return {
    ...saved,
    seenIds: applyFilters(entries, intentFilters(saved.intent)).map((e) => e.id),
  };
}

const SENIORITY_VALUES = new Set(["all", "cto", "vp", "avp", "director", "head"]);
const VISA_VALUES = new Set(["all", "yes"]);
const WORKMODE_VALUES = new Set(["all", "remote", "hybrid", "onsite"]);
const REGION_VALUES = new Set<RegionId | "all">([
  "all",
  "india",
  "middle-east",
  "southeast-asia",
  "north-africa",
  "europe",
  "north-america",
  "remote",
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validIntent(v: unknown): v is QuestionIntent {
  if (!isObject(v)) return false;
  return (
    typeof v.query === "string" &&
    SENIORITY_VALUES.has(v.seniority as string) &&
    REGION_VALUES.has(v.region as RegionId) &&
    typeof v.country === "string" &&
    VISA_VALUES.has(v.visa as string) &&
    WORKMODE_VALUES.has(v.workMode as string)
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
    validIntent(v.intent) &&
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
