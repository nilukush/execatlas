import { describe, expect, it } from "vitest";
import { carryOver } from "./carry";
import type { FeedFailure } from "./http";
import type { Job, SourceId } from "../../src/lib/types";

// the stamp of the previous dataset: the last refresh that stored the records
const PREVIOUS = "2026-11-23T03:17:00.000Z";
// the next night: the run that judges those records
const NOW = "2026-11-24T03:17:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

function job(id: string, over: Partial<Job> = {}): Job {
  return {
    id,
    title: "Director of Engineering",
    // a company of its own, so two records share a key only where a test says so
    company: `Acme ${id}`,
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
const notFound = [failure("greenhouse", "board-x", { status: 404, transient: false })];
const nothing = { jobs: [], carriedBySource: {}, graceCount: 0 };

function carry(previous: Job[], fresh: Job[] = [], failures: FeedFailure[] = rateLimited) {
  return carryOver({ previous, previousGeneratedAt: PREVIOUS, fresh, failures, now: NOW });
}

describe("carryOver", () => {
  it("keeps a role of a feed that failed tonight, one night counted", () => {
    const seen = "2026-11-22T03:17:00.000Z";
    const { jobs, carriedBySource, graceCount } = carry([job("a", { lastSeenAt: seen })]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: "a", carriedNights: 1, lastSeenAt: seen });
    expect(carriedBySource).toEqual({ greenhouse: 1 });
    expect(graceCount).toBe(0);
  });

  it("counts a transient failure of its feed as a carried night only, never as an absent one", () => {
    const { jobs } = carry([job("a")]);
    expect(jobs[0]).toMatchObject({ carriedNights: 1 });
    expect(jobs[0]).not.toHaveProperty("absentNights");
  });

  it("drops the role at once when its feed failed for good, as a 404 does, even from grace", () => {
    expect(carry([job("a")], [], notFound)).toEqual(nothing);
    expect(carry([job("a", { absentNights: 2 })], [], notFound)).toEqual(nothing);
  });

  it("keeps a role in grace when the feed that failed for good is not its own", () => {
    // another feed of its source, then a feed of a record from before feeds were tagged
    const otherUnit = [failure("greenhouse", "board-y", { status: 404, transient: false })];
    expect(carry([job("a")], [], otherUnit).graceCount).toBe(1);
    expect(carry([job("a", { feedUnit: undefined })], [], notFound).graceCount).toBe(1);
  });

  it("keeps a role that its answering feed no longer lists for two nights, a night at a time", () => {
    const seen = "2026-11-22T03:17:00.000Z";
    const first = carry([job("a", { lastSeenAt: seen })], [], []).jobs[0];
    expect(first).toMatchObject({ id: "a", absentNights: 1, lastSeenAt: seen });
    expect(first).not.toHaveProperty("carriedNights");
    const second = carry([first], [], []).jobs[0];
    expect(second).toMatchObject({ id: "a", absentNights: 2, lastSeenAt: seen });
    // the third absent night drops it
    expect(carry([second], [], [])).toEqual(nothing);
  });

  it("stores the grace record as it was, apart from the night count and the last-seen stamp", () => {
    const previous = job("a");
    const { jobs, carriedBySource, graceCount } = carry([previous], [], []);
    expect(jobs).toEqual([{ ...previous, absentNights: 1, lastSeenAt: PREVIOUS }]);
    expect(carriedBySource).toEqual({});
    expect(graceCount).toBe(1);
    expect(previous).not.toHaveProperty("absentNights");
    expect(previous).not.toHaveProperty("lastSeenAt");
  });

  it("carries nothing when another source or another unit failed: the role left an answering feed", () => {
    const otherSource = carry([job("a")], [], [failure("workable", "board-x")]);
    expect(otherSource.carriedBySource).toEqual({});
    expect(otherSource.jobs).toMatchObject([{ id: "a", absentNights: 1 }]);
    expect(carry([job("a")], [], [failure("greenhouse", "board-y")]).jobs).toMatchObject([{ id: "a", absentNights: 1 }]);
  });

  it("drops the role after three carried nights although its feed failed again", () => {
    expect(carry([job("a", { carriedNights: 3 })])).toEqual(nothing);
  });

  it("lets the fresh record win and leaves it without a night count", () => {
    const fresh = [job("a", { updatedAt: "2026-11-24T03:17:00.000Z" })];
    expect(carry([job("a", { carriedNights: 2 })], fresh)).toEqual(nothing);
    expect(carry([job("a", { absentNights: 2 })], fresh)).toEqual(nothing);
    expect(fresh[0]).not.toHaveProperty("carriedNights");
    expect(fresh[0]).not.toHaveProperty("absentNights");
    expect(fresh[0]).not.toHaveProperty("lastSeenAt");
  });

  it("never carries, and never keeps in grace, a role that a fresh record holds tonight under another id", () => {
    // the same company, normalized title and place: only the spelling and the id differ
    const stored = job("stored", { company: "Acme & Co", title: "VP of Engineering & Product", carriedNights: 1 });
    const fresh = job("fresh", { company: "ACME & CO", title: "VP Engineering & Product" });
    expect(fresh.id).not.toBe(stored.id);
    expect(carry([stored], [fresh], rateLimited)).toEqual(nothing);
    expect(carry([stored], [fresh], [])).toEqual(nothing);
    // the same company and title in another place is another role
    const elsewhere = job("elsewhere", {
      ...fresh,
      location: { region: null, remote: true, raw: "Remote" },
    });
    expect(carry([stored], [elsewhere], []).graceCount).toBe(1);
  });

  it("drops a role posted more than 365 whole days ago, carried or in grace, and keeps one at 365 days", () => {
    const postedDaysAgo = (days: number) => new Date(Date.parse(NOW) - days * DAY_MS).toISOString();
    const tooOld = job("old", { postedAt: postedDaysAgo(366), carriedNights: 1 });
    expect(carry([tooOld], [], rateLimited)).toEqual(nothing);
    expect(carry([tooOld], [], [])).toEqual(nothing);
    expect(carry([job("edge", { postedAt: postedDaysAgo(365) })], [], []).jobs).toHaveLength(1);
    // a date that does not parse proves no age
    expect(carry([job("odd", { postedAt: "not a date" })], [], []).jobs).toHaveLength(1);
  });

  it("keeps a record from before feeds were tagged when any feed of its source failed", () => {
    const { jobs, carriedBySource } = carry([job("a", { feedUnit: undefined })], [], [failure("greenhouse", "board-q")]);
    expect(jobs).toMatchObject([{ id: "a", carriedNights: 1, lastSeenAt: PREVIOUS }]);
    expect(carriedBySource).toEqual({ greenhouse: 1 });
  });

  it("keeps a record from before feeds were tagged in grace when no feed of its source failed", () => {
    const untagged = job("a", { feedUnit: undefined });
    const { jobs, carriedBySource, graceCount } = carry([untagged], [], [failure("workable", "board-x")]);
    // as it was: the record still names no feed
    expect(jobs).toEqual([{ ...untagged, absentNights: 1, lastSeenAt: PREVIOUS }]);
    expect(carriedBySource).toEqual({});
    expect(graceCount).toBe(1);
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

  it("leaves lastSeenAt absent when the record has none and there is no previous dataset stamp", () => {
    const { jobs } = carryOver({ previous: [job("a")], fresh: [], failures: rateLimited, now: NOW });
    expect(jobs[0]).toMatchObject({ id: "a", carriedNights: 1 });
    expect(jobs[0]).not.toHaveProperty("lastSeenAt");
  });

  it("lists the carried and the grace records apart, and counts each kind on its own", () => {
    const fresh = [job("kept", { feedUnit: "board-y" })];
    const previous = [
      job("a"),
      job("b"),
      job("gone", { feedUnit: "board-y" }),
      job("h", { source: "himalayas", sources: ["himalayas"], feedUnit: "cto/director" }),
      job("w", { source: "workable", sources: ["workable"], feedUnit: "CTO/UAE" }),
    ];
    const { jobs, carriedBySource, graceCount } = carry(previous, fresh, [...rateLimited, failure("himalayas", "cto/director")]);
    expect(jobs.map((entry) => entry.id)).toEqual(["a", "b", "gone", "h", "w"]);
    expect(carriedBySource).toEqual({ greenhouse: 2, himalayas: 1 });
    expect(graceCount).toBe(2);
  });

  it("moves one counter a night and leaves the other as it was", () => {
    // carried one night, then its feed answered without it
    expect(carry([job("a", { carriedNights: 1 })], [], []).jobs[0]).toMatchObject({ carriedNights: 1, absentNights: 1 });
    // one night in grace, then its feed failed
    expect(carry([job("b", { absentNights: 1 })]).jobs[0]).toMatchObject({ absentNights: 1, carriedNights: 1 });
  });

  it("carries nothing on a first run, which has no previous dataset", () => {
    expect(carryOver({ previous: [], fresh: [], failures: rateLimited, now: NOW })).toEqual(nothing);
  });
});
