import { describe, expect, it } from "vitest";
import { computeStats } from "./run";
import { SOURCE_IDS } from "../../src/lib/types";
import type { Job } from "../../src/lib/types";

const base = {
  id: "j1",
  title: "Director of Engineering",
  company: "Acme",
  applyUrl: "https://acme.example/1",
  sourceUrl: "https://acme.example/1",
  source: "greenhouse",
  sources: ["greenhouse"],
  text: "",
  blocks: [],
  requirements: [],
  location: { region: "europe", remote: false, raw: "Berlin" },
  seniority: "director",
  domain: "engineering",
  visa: "unknown",
  workMode: "onsite",
  roleType: null,
  salary: null,
  postedAt: "2026-09-01",
  firstSeen: "2026-09-01",
  updatedAt: "2026-09-01",
} as Job;

describe("computeStats", () => {
  it("scores each source on exclusivity, signals and freshness", () => {
    const stats = computeStats([base], "2026-09-22T00:00:00.000Z");
    const q = stats.bySourceQuality!.greenhouse;
    expect(q).toEqual({ kept: 1, exclusive: 1, visaKnown: 0, salaryStated: 0, medianPostedAgeDays: 21 });
  });

  it("reports every configured source, zeros included", () => {
    const stats = computeStats([base], "2026-09-20T00:00:00.000Z");
    expect(Object.keys(stats.bySource).sort()).toEqual([...SOURCE_IDS].sort());
    expect(stats.bySource).toMatchObject({ greenhouse: 1, workable: 0, arbeitnow: 0, jobicy: 0, lever: 0, ashby: 0 });
  });
});

describe("computeStats carry report", () => {
  const carried = { ...base, id: "j2", source: "himalayas" as const, sources: ["himalayas" as const], carriedNights: 2 };
  const failedFeed = { source: "himalayas" as const, unit: "cto/director", status: 429, transient: true, message: "HTTP 429" };

  it("reports the carried roles, total and per source, and the failed feeds", () => {
    const stats = computeStats([base, carried], "2026-11-24T00:00:00.000Z", {
      carriedBySource: { himalayas: 1 },
      failedFeeds: [failedFeed],
    });
    expect(stats.carried).toEqual({ total: 1, bySource: { himalayas: 1 } });
    expect(stats.failedFeeds).toEqual([failedFeed]);
  });

  it("counts a carried role in every total, like a role seen tonight", () => {
    const stats = computeStats([base, carried], "2026-11-24T00:00:00.000Z", {
      carriedBySource: { himalayas: 1 },
      failedFeeds: [],
    });
    expect(stats.total).toBe(2);
    expect(stats.bySource.himalayas).toBe(1);
    expect(stats.byRegion).toEqual({ europe: 2 });
    expect(stats.byVisa).toEqual({ unknown: 2 });
    expect(stats.bySourceQuality!.himalayas.kept).toBe(1);
  });

  it("reports zero carried roles and no failed feeds on a night without a failure", () => {
    const stats = computeStats([base], "2026-11-24T00:00:00.000Z", { carriedBySource: {}, failedFeeds: [] });
    expect(stats.carried).toEqual({ total: 0, bySource: {} });
    expect(stats.failedFeeds).toEqual([]);
  });

  it("writes no carry report when the caller passes none", () => {
    const stats = computeStats([base], "2026-11-24T00:00:00.000Z");
    expect(stats).not.toHaveProperty("carried");
    expect(stats).not.toHaveProperty("failedFeeds");
  });
});
