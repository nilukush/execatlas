import { describe, expect, it } from "vitest";
import {
  createSavedSearch,
  markSeen,
  newMatches,
  parseSavedSearches,
  serializeSavedSearches,
  type SavedSearch,
} from "./saved-searches";
import { DEFAULT_FILTERS } from "./search";
import type { IndexEntry } from "./types";

function make(over: Partial<IndexEntry>): IndexEntry {
  return {
    id: over.id ?? "j1",
    title: over.title ?? "VP of Engineering",
    company: over.company ?? "Acme",
    seniority: over.seniority ?? "vp",
    domain: over.domain ?? "engineering",
    countryIso2: over.countryIso2 ?? "AE",
    countryName: over.countryName ?? "United Arab Emirates",
    region: over.region ?? "middle-east",
    remote: over.remote ?? false,
    visa: over.visa ?? "unknown",
    workMode: over.workMode ?? "onsite",
    roleType: over.roleType ?? "permanent",
    postedAt: over.postedAt ?? "2026-09-01",
    source: over.source ?? "greenhouse",
  };
}

const filters = { ...DEFAULT_FILTERS, seniority: "vp" as const, query: "engineering" };

describe("newMatches", () => {
  it("returns current matches whose ids were not seen yet", () => {
    const saved: SavedSearch = { ...createSavedSearch("vp engineering?", filters, "s1"), seenIds: ["old1", "match1"] };
    const entries = [
      make({ id: "match1", postedAt: "2026-09-05" }),
      make({ id: "fresh", postedAt: "2026-09-06" }),
      make({ id: "director", seniority: "director" }),
    ];
    expect(newMatches(saved, entries).map((e) => e.id)).toEqual(["fresh"]);
  });
});

describe("markSeen", () => {
  it("records the current match ids as seen", () => {
    const saved = createSavedSearch("vp engineering?", filters, "s1");
    const entries = [make({ id: "a" }), make({ id: "b" }), make({ id: "director", seniority: "director" })];
    const updated = markSeen(saved, entries);
    expect(updated.seenIds.sort()).toEqual(["a", "b"]);
    expect(newMatches(updated, entries)).toEqual([]);
  });
});

describe("saved searches keep the full filter state", () => {
  it("round-trips roleType, source, sort and visa no", () => {
    const full = {
      ...filters,
      roleType: "contract",
      source: "workable",
      sort: "salary",
      visa: "no",
    } as const;
    const saved = createSavedSearch("", full, "s1");
    const parsed = parseSavedSearches(serializeSavedSearches([saved]));
    expect(parsed[0].filters).toEqual(full);
  });

  it("counts new matches against the narrowed filters, not a superset", () => {
    const narrowed = { ...DEFAULT_FILTERS, visa: "no" as const };
    const saved = { ...createSavedSearch("", narrowed, "s1"), seenIds: [] };
    const entries = [make({ id: "no", visa: "no" }), make({ id: "unknown", visa: "unknown" })];
    expect(newMatches(saved, entries).map((e) => e.id)).toEqual(["no"]);
  });
});

describe("parse and serialize", () => {
  it("round-trips a saved list", () => {
    const list = [createSavedSearch("vp?", filters, "s1")];
    expect(parseSavedSearches(serializeSavedSearches(list))).toEqual(list);
  });

  it("returns an empty list for null, empty or garbage input", () => {
    expect(parseSavedSearches(null)).toEqual([]);
    expect(parseSavedSearches("")).toEqual([]);
    expect(parseSavedSearches("not json")).toEqual([]);
    expect(parseSavedSearches("{\"nope\":1}")).toEqual([]);
  });

  it("drops entries with invalid filters but keeps valid siblings", () => {
    const good = createSavedSearch("vp?", filters, "s1");
    const raw = JSON.stringify([
      good,
      { id: "", question: "x", filters, seenIds: [] },
      { id: "s2", question: "x", filters: { ...filters, seniority: "ceo" }, seenIds: [] },
      { id: "s3", question: "x", filters: { ...filters, visa: "maybe" }, seenIds: [] },
      { id: "s4", question: "x", filters: { ...filters, source: "linkedin" }, seenIds: [] },
      { id: "s5", question: "x", filters: { ...filters, sort: "relevance" }, seenIds: [] },
      { id: "s6", question: "x", filters: { ...filters, country: "uae" }, seenIds: [] },
      { id: "s7", question: "x", filters, seenIds: "nope" },
      { id: "s8", filters, seenIds: [] },
    ]);
    expect(parseSavedSearches(raw)).toEqual([good]);
  });

  it("tolerates a missing createdAt and seenIds", () => {
    const raw = JSON.stringify([{ id: "s9", question: "q", filters }]);
    const parsed = parseSavedSearches(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].seenIds).toEqual([]);
    expect(parsed[0].createdAt).toBe("");
  });

  it("drops legacy entries that stored an intent instead of filters", () => {
    const legacy = JSON.stringify([
      { id: "s1", question: "q", intent: { query: "engineering", seniority: "vp", region: "all", country: "all", visa: "all", workMode: "all" }, seenIds: [] },
    ]);
    expect(parseSavedSearches(legacy)).toEqual([]);
  });
});
