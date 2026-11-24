import { describe, expect, it } from "vitest";
import { carryOver } from "./carry";
import type { FeedFailure } from "./http";
import type { Job, SourceId } from "../../src/lib/types";

// the stamp of the previous dataset: the last refresh that stored the records
const PREVIOUS = "2026-11-23T03:17:00.000Z";

function job(id: string, over: Partial<Job> = {}): Job {
  return {
    id,
    title: "Director of Engineering",
    company: "Acme",
    applyUrl: `https://acme.example/${id}`,
    sourceUrl: `https://acme.example/${id}`,
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
    postedAt: "2026-11-01",
    firstSeen: "2026-11-02",
    updatedAt: "2026-11-10",
    feedUnit: "board-x",
    ...over,
  };
}

function failure(source: SourceId, unit: string, over: Partial<FeedFailure> = {}): FeedFailure {
  return { source, unit, status: 429, transient: true, message: `HTTP 429 for ${unit}`, ...over };
}

const rateLimited = [failure("greenhouse", "board-x")];
const nothing = { jobs: [], carriedBySource: {} };

function carry(previous: Job[], fresh: Job[] = [], failures: FeedFailure[] = rateLimited) {
  return carryOver({ previous, previousGeneratedAt: PREVIOUS, fresh, failures });
}

describe("carryOver", () => {
  it("keeps a role of a feed that failed tonight, one night counted", () => {
    const seen = "2026-11-22T03:17:00.000Z";
    const { jobs, carriedBySource } = carry([job("a", { lastSeenAt: seen })]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: "a", carriedNights: 1, lastSeenAt: seen });
    expect(carriedBySource).toEqual({ greenhouse: 1 });
  });

  it("drops the role when its feed failed for good, as a 404 does", () => {
    const notFound = [failure("greenhouse", "board-x", { status: 404, transient: false })];
    expect(carry([job("a")], [], notFound)).toEqual(nothing);
  });

  it("drops the role when nothing failed: its feed went quiet", () => {
    expect(carry([job("a")], [], [])).toEqual(nothing);
  });

  it("drops the role after three carried nights although its feed failed again", () => {
    expect(carry([job("a", { carriedNights: 3 })])).toEqual(nothing);
  });

  it("lets the fresh record win and leaves it without a carried night", () => {
    const fresh = [job("a", { updatedAt: "2026-11-24T03:17:00.000Z" })];
    expect(carry([job("a", { carriedNights: 2 })], fresh)).toEqual(nothing);
    expect(fresh[0]).not.toHaveProperty("carriedNights");
    expect(fresh[0]).not.toHaveProperty("lastSeenAt");
  });

  it("drops the role when another source or another unit failed", () => {
    expect(carry([job("a")], [], [failure("workable", "board-x")]).jobs).toEqual([]);
    expect(carry([job("a")], [], [failure("greenhouse", "board-y")]).jobs).toEqual([]);
  });

  it("keeps a record from before feeds were tagged when any feed of its source failed", () => {
    const { jobs, carriedBySource } = carry([job("a", { feedUnit: undefined })], [], [failure("greenhouse", "board-q")]);
    expect(jobs).toMatchObject([{ id: "a", carriedNights: 1, lastSeenAt: PREVIOUS }]);
    expect(carriedBySource).toEqual({ greenhouse: 1 });
  });

  it("drops a record from before feeds were tagged when no feed of its source failed", () => {
    expect(carry([job("a", { feedUnit: undefined })], [], [failure("workable", "board-x")]).jobs).toEqual([]);
  });

  it("stores the carried record as it was, apart from the night count and the last-seen stamp", () => {
    const previous = job("a");
    const { jobs } = carry([previous]);
    expect(jobs).toEqual([{ ...previous, carriedNights: 1, lastSeenAt: PREVIOUS }]);
    expect(previous).not.toHaveProperty("carriedNights");
    expect(previous).not.toHaveProperty("lastSeenAt");
  });

  it("counts each further failed night and keeps the last-seen stamp of the first one", () => {
    const seen = "2026-11-20T03:17:00.000Z";
    const second = carry([job("a", { carriedNights: 1, lastSeenAt: seen })]).jobs[0];
    expect(second).toMatchObject({ carriedNights: 2, lastSeenAt: seen });
    const third = carry([job("a", { carriedNights: 2, lastSeenAt: seen })]).jobs[0];
    expect(third).toMatchObject({ carriedNights: 3, lastSeenAt: seen });
  });

  it("lists only the carried records and counts them per source", () => {
    const fresh = [job("kept", { feedUnit: "board-y" })];
    const previous = [
      job("a"),
      job("b"),
      job("gone", { feedUnit: "board-y" }),
      job("h", { source: "himalayas", sources: ["himalayas"], feedUnit: "cto/director" }),
      job("w", { source: "workable", sources: ["workable"], feedUnit: "CTO/UAE" }),
    ];
    const { jobs, carriedBySource } = carry(previous, fresh, [...rateLimited, failure("himalayas", "cto/director")]);
    expect(jobs.map((entry) => entry.id)).toEqual(["a", "b", "h"]);
    expect(carriedBySource).toEqual({ greenhouse: 2, himalayas: 1 });
  });

  it("carries nothing on a first run, which has no previous dataset", () => {
    expect(carryOver({ previous: [], fresh: [], failures: rateLimited })).toEqual(nothing);
  });
});
