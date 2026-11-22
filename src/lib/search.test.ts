import { describe, expect, it } from "vitest";
import { applyFilters, countPostedWithin, DEFAULT_FILTERS, defaultOrder, PAGE_SIZE, paginate } from "./search";
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
    variantCountries: over.variantCountries,
    postedAt: over.postedAt ?? "2026-09-01",
    source: over.source ?? "greenhouse",
    salaryMin: over.salaryMin,
    salaryMax: over.salaryMax,
    salaryCurrency: over.salaryCurrency,
    salaryPeriod: over.salaryPeriod,
  };
}

describe("countPostedWithin", () => {
  const NOW = new Date("2026-09-21T12:00:00.000Z").getTime();
  it("counts entries posted inside the window", () => {
    const entries = [
      make({ id: "today", postedAt: "2026-09-21T08:00:00.000Z" }),
      make({ id: "edge", postedAt: "2026-09-14T12:00:00.000Z" }),
      make({ id: "old", postedAt: "2026-08-01T00:00:00.000Z" }),
    ];
    expect(countPostedWithin(entries, 7, NOW)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(countPostedWithin([], 7, NOW)).toBe(0);
  });
});

describe("salary sort with local pay conventions (issue 39)", () => {
  it("annualizes monthly bands with the country's months-per-year convention", () => {
    const philippines = make({
      id: "phl-monthly",
      countryIso2: "PH",
      // PHP 250000 monthly is about USD 4000: flat-12 annualizes under the
      // USD 50k band while the 13-month convention clears it
      salaryMin: 220000,
      salaryMax: 250000,
      salaryCurrency: "PHP",
      salaryPeriod: "monthly",
    });
    const anywhereAnnual = make({
      id: "flat-annual",
      salaryMin: 50000,
      salaryMax: 50000,
      salaryCurrency: "USD",
      salaryPeriod: "annual",
    });
    const result = applyFilters([philippines, anywhereAnnual], { ...DEFAULT_FILTERS, sort: "salary" });
    // PHP 300000 monthly x 13 months is roughly USD 68k at ~57 PHP/USD,
    // so the Philippine role must outrank the flat USD 50k annual band;
    // a flat 12 would leave them nearly tied in the wrong direction
    expect(result.map((e) => e.id)).toEqual(["phl-monthly", "flat-annual"]);
  });
});

describe("variant-aware filters", () => {
  it("matches a country filter against any variant country", () => {
    const grouped = make({
      id: "grouped",
      countryIso2: "LV",
      countryName: "Latvia",
      region: "europe",
      variantCountries: [
        { countryIso2: "PL", countryName: "Poland", region: "europe", remote: false, applyUrl: "https://x.example/1" },
        { countryIso2: "RS", countryName: "Serbia", region: "europe", remote: false, applyUrl: "https://x.example/2" },
      ],
    });
    const result = applyFilters([grouped], { ...DEFAULT_FILTERS, country: "PL" });
    expect(result.map((e) => e.id)).toEqual(["grouped"]);
  });

  it("matches a region filter against any variant region", () => {
    const grouped = make({
      id: "grouped",
      countryIso2: "CA",
      countryName: "Canada",
      region: "north-america",
      variantCountries: [
        { countryIso2: "PL", countryName: "Poland", region: "europe", remote: false, applyUrl: "https://x.example/1" },
      ],
    });
    const result = applyFilters([grouped], { ...DEFAULT_FILTERS, region: "europe" });
    expect(result.map((e) => e.id)).toEqual(["grouped"]);
  });

  it("matches the remote region filter when a variant is remote", () => {
    const grouped = make({
      id: "grouped",
      remote: false,
      variantCountries: [
        { region: null, remote: true, applyUrl: "https://x.example/r", countryName: undefined, countryIso2: undefined },
      ],
    });
    const result = applyFilters([grouped], { ...DEFAULT_FILTERS, region: "remote" });
    expect(result.map((e) => e.id)).toEqual(["grouped"]);
  });
});

describe("defaultOrder", () => {
  it("returns every entry newest first", () => {
    const entries = [
      make({ id: "old", postedAt: "2026-08-01" }),
      make({ id: "new", postedAt: "2026-09-05" }),
      make({ id: "mid", postedAt: "2026-08-20" }),
    ];
    expect(defaultOrder(entries).map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("breaks postedAt ties by id so static pages are deterministic", () => {
    const entries = [make({ id: "b", postedAt: "2026-09-01" }), make({ id: "a", postedAt: "2026-09-01" })];
    expect(defaultOrder(entries).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("matches the browser default view exactly", () => {
    const entries = [
      make({ id: "x", postedAt: "2026-08-01", title: "Head of Engineering" }),
      make({ id: "y", postedAt: "2026-09-05", title: "Director of Technology" }),
    ];
    expect(defaultOrder(entries).map((e) => e.id)).toEqual(
      applyFilters(entries, DEFAULT_FILTERS).map((e) => e.id)
    );
  });
});

describe("salary sort", () => {
  it("annualizes monthly bands before comparing against annual bands", () => {
    const monthly = make({
      id: "monthly",
      salaryMax: 60_000,
      salaryCurrency: "AED",
      salaryPeriod: "monthly",
      postedAt: "2026-09-01",
    });
    const annual = make({
      id: "annual",
      salaryMax: 150_000,
      salaryCurrency: "USD",
      salaryPeriod: "annual",
      postedAt: "2026-09-01",
    });
    const ordered = applyFilters([annual, monthly], { ...DEFAULT_FILTERS, sort: "salary" });
    // AED 60,000 per month is roughly USD 196,000 per year, above USD 150,000
    expect(ordered.map((e) => e.id)).toEqual(["monthly", "annual"]);
  });
});

describe("paginate", () => {
  it("splits into pages of PAGE_SIZE and reports the page count", () => {
    const entries = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, i) => make({ id: `j${i}` }));
    expect(paginate(entries, 1).slice).toHaveLength(PAGE_SIZE);
    expect(paginate(entries, 1).pageCount).toBe(3);
    expect(paginate(entries, 3).slice).toHaveLength(1);
  });

  it("clamps out-of-range page numbers", () => {
    const entries = [make({ id: "only" })];
    expect(paginate(entries, 9).slice.map((e) => e.id)).toEqual(["only"]);
    expect(paginate(entries, 0).pageCount).toBe(1);
  });
});
