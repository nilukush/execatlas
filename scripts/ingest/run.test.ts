import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Job } from "../../src/lib/types";

// These stay installed for the whole file. If an import ever runs main()
// again, the rejecting fetch takes every request and main() parks on its
// first fake timer (the politeness delay), so nothing reaches the network or
// the env file.
// vitest clears mock call history before each test, so the import is recorded
// in plain arrays and a counter instead of vi.fn() calls.
vi.useFakeTimers();
vi.stubGlobal("fetch", () => Promise.reject(new Error("network parked")));
const logged: unknown[][] = [];
console.log = (...args: unknown[]) => {
  logged.push(args);
};
let envFileLoads = 0;
process.loadEnvFile = () => {
  envFileLoads += 1;
};

const job: Job = {
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
  postedAt: "2026-11-01",
  firstSeen: "2026-11-01",
  updatedAt: "2026-11-01",
};

describe("scripts/ingest/run entry point", () => {
  let entry: typeof import("./run");

  beforeAll(async () => {
    entry = await import("./run");
  });

  it("starts no ingest when imported", () => {
    const started = logged.filter(
      ([line]) => typeof line === "string" && line.startsWith("Ingest started")
    );
    expect(started).toEqual([]);
  });

  it("loads no env file when imported", () => {
    expect(envFileLoads).toBe(0);
  });

  it("still exports computeStats, which returns total 1 for one job", () => {
    const stats = entry.computeStats([job], "2026-11-24T00:00:00.000Z");
    expect(stats.total).toBe(1);
  });

  it("copies relocation, visaBasis and locationRestrictions into the index", () => {
    const indexed = entry.toIndexEntry({
      ...job,
      visa: "yes",
      visaBasis: "source",
      relocation: "yes",
      location: { ...job.location, remote: true, restrictions: ["Colombia", "Jamaica"] },
    });
    expect(indexed.visa).toBe("yes");
    expect(indexed.visaBasis).toBe("source");
    expect(indexed.relocation).toBe("yes");
    expect(indexed.locationRestrictions).toEqual(["Colombia", "Jamaica"]);
  });

  it("adds no signal field to the index entry of an old dataset record", () => {
    const stored = JSON.parse(JSON.stringify(entry.toIndexEntry(job)));
    expect(stored).not.toHaveProperty("relocation");
    expect(stored).not.toHaveProperty("visaBasis");
    expect(stored).not.toHaveProperty("locationRestrictions");
  });

  it("copies sourceHome into the index entry and adds none to an old dataset record", () => {
    expect(entry.toIndexEntry({ ...job, sourceHome: "https://www.adzuna.com" }).sourceHome).toBe(
      "https://www.adzuna.com"
    );
    const stored = JSON.parse(JSON.stringify(entry.toIndexEntry(job)));
    expect(stored).not.toHaveProperty("sourceHome");
  });

  describe("collected failures", () => {
    it("stores a reported failure with the query string of its URL removed, and so with no key", () => {
      const { failures, reportFailure } = entry.failureCollector();
      reportFailure({
        source: "adzuna",
        unit: "gb/engineering director",
        status: 429,
        transient: true,
        message: "https://api.example.test/search?app_id=abc123&app_key=SECRETVALUE&what=x",
      });
      expect(failures).toHaveLength(1);
      expect(failures[0].message).toBe("https://api.example.test/search");
      expect(failures[0]).toMatchObject({
        source: "adzuna",
        unit: "gb/engineering director",
        status: 429,
        transient: true,
      });
      expect(JSON.stringify(failures)).not.toContain("SECRETVALUE");
      expect(JSON.stringify(failures)).not.toContain("app_key");
    });

    it("keeps a message that holds no query string as it was, and collects every report in order", () => {
      const { failures, reportFailure } = entry.failureCollector();
      reportFailure({
        source: "greenhouse",
        unit: "stripe",
        status: 404,
        transient: false,
        message: "HTTP 404 for https://boards-api.greenhouse.io/v1/boards/stripe/jobs",
      });
      reportFailure({ source: "arbeitnow", unit: "page-1", transient: true, message: "boom" });
      expect(failures.map((failure) => failure.message)).toEqual([
        "HTTP 404 for https://boards-api.greenhouse.io/v1/boards/stripe/jobs",
        "boom",
      ]);
    });
  });

  describe("selectConnectors", () => {
    const all = [{ id: "greenhouse" }, { id: "himalayas" }];

    it("keeps every connector when no source is named", () => {
      expect(entry.selectConnectors(all, null)).toEqual(all);
    });

    it("keeps only the connector that a --only id names", () => {
      expect(entry.selectConnectors(all, "himalayas")).toEqual([{ id: "himalayas" }]);
    });

    it("refuses an id that matches no connector, naming it, instead of running nothing", () => {
      expect(() => entry.selectConnectors(all, "linkedin")).toThrow(/linkedin/);
    });
  });

  describe("records judged tonight", () => {
    const previous: Job[] = [
      job,
      { ...job, id: "j2", source: "himalayas", sources: ["himalayas"] },
      { ...job, id: "j3", source: "adzuna", sources: ["adzuna"] },
    ];

    it("hands carryOver only the previous records of the sources fetched tonight", () => {
      const ids = (sources: string[]) => entry.previousOfSources(previous, sources).map((record) => record.id);
      expect(ids(["himalayas"])).toEqual(["j2"]);
      expect(ids(["greenhouse", "adzuna"])).toEqual(["j1", "j3"]);
      // a full run fetches every source and judges every record
      expect(ids(["greenhouse", "himalayas", "adzuna"])).toEqual(["j1", "j2", "j3"]);
    });
  });

  describe("rememberSourceVisa", () => {
    const visaFeed = { source: "arbeitnow" as const, unit: "visa-feed-2", status: 429, transient: true, message: "HTTP 429" };
    const jobPage = { source: "arbeitnow" as const, unit: "page-1", status: 429, transient: true, message: "HTTP 429" };

    it("is passed for a transient visa feed failure", () => {
      expect(entry.visaFeedFailed([visaFeed])).toBe(true);
      expect(entry.visaFeedFailed([jobPage, visaFeed])).toBe(true);
    });

    it("is passed for nothing else", () => {
      expect(entry.visaFeedFailed([])).toBe(false);
      // gone for good, a job page, and a visa feed of another source
      expect(entry.visaFeedFailed([{ ...visaFeed, transient: false }])).toBe(false);
      expect(entry.visaFeedFailed([jobPage])).toBe(false);
      expect(entry.visaFeedFailed([{ ...visaFeed, source: "greenhouse", unit: "visa-feed-1" }])).toBe(false);
    });
  });

  describe("a quiet night", () => {
    const nextNight = "2026-11-25T03:17:00.000Z";
    const previous = { version: 2, generatedAt: "2026-11-24T03:17:00.000Z", jobs: [job] };

    it("keeps the previous stamp and the previous records when only lastSeenAt differs", () => {
      const fresh = [{ ...job, lastSeenAt: nextNight }];
      expect(entry.settleNight(fresh, previous, nextNight)).toEqual({
        jobs: previous.jobs,
        generatedAt: "2026-11-24T03:17:00.000Z",
      });
    });

    it("writes the final records with tonight's stamp on any other night", () => {
      const changed = [{ ...job, updatedAt: nextNight, lastSeenAt: nextNight }];
      expect(entry.settleNight(changed, previous, nextNight)).toEqual({ jobs: changed, generatedAt: nextNight });
      const absent = [{ ...job, lastSeenAt: nextNight, absentNights: 1 }];
      expect(entry.settleNight(absent, previous, nextNight).jobs).toEqual(absent);
      expect(entry.settleNight([], previous, nextNight).generatedAt).toBe(nextNight);
      // a first run has no previous dataset
      expect(entry.settleNight([job], null, nextNight)).toEqual({ jobs: [job], generatedAt: nextNight });
    });
  });

  it("adds no last seen date, night count or expiry to the index entry", () => {
    const stored = JSON.parse(
      JSON.stringify(
        entry.toIndexEntry({
          ...job,
          lastSeenAt: "2026-11-24T03:17:00.000Z",
          absentNights: 1,
          expiresAt: "2026-12-24T00:00:00.000Z",
        })
      )
    );
    expect(stored).not.toHaveProperty("lastSeenAt");
    expect(stored).not.toHaveProperty("absentNights");
    expect(stored).not.toHaveProperty("expiresAt");
  });
});
