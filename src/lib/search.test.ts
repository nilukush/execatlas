import { describe, expect, it } from "vitest";
import { applyFilters, DEFAULT_FILTERS, defaultOrder, PAGE_SIZE, paginate } from "./search";
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
