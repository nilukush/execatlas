import { beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeJob, stableIdForRaw } from "./normalize";
import { dedupeJobs } from "./dedupe";
import { carryOver } from "./carry";
import type { Job, RawJob, SourceId } from "../../src/lib/types";

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

  it("copies the sources into the index entry and adds none to a record of an old dataset", () => {
    expect(entry.toIndexEntry({ ...job, sources: ["greenhouse", "adzuna"] }).sources).toEqual(["greenhouse", "adzuna"]);
    // a record written before the list was kept reaches toIndexEntry as parsed JSON, without the field
    const { sources: _dropped, ...oldRecord } = job;
    const stored = JSON.parse(JSON.stringify(entry.toIndexEntry(oldRecord as Job)));
    expect(stored).not.toHaveProperty("sources");
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

  describe("the stored record a raw job continues tonight", () => {
    const NIGHT_ONE = "2026-11-20T03:17:00.000Z";
    const NOW = "2026-11-24T03:17:00.000Z";

    // the same role on two sources: one company, one title and one place
    const raw = (source: SourceId, externalId: string, over: Partial<RawJob> = {}): RawJob => ({
      source,
      externalId,
      title: "Director of Engineering",
      company: "Acme Payments",
      applyUrl: `https://${source}.example/${externalId}`,
      sourceUrl: `https://${source}.example/${externalId}`,
      descriptionHtml: "<p>Lead four teams.</p>",
      locationRaw: "Dubai, UAE",
      postedAt: "2026-11-10T08:00:00.000Z",
      ...over,
    });
    const onGreenhouse = raw("greenhouse", "gh-100");
    const onArbeitnow = raw("arbeitnow", "ab-1");
    // night one found the role on both sources: the merged record is stored under the id of the elder
    const merged = dedupeJobs([normalizeJob(onGreenhouse, NIGHT_ONE)!, normalizeJob(onArbeitnow, NIGHT_ONE)!])[0];

    it("is the merged record stored under the id of the elder source, for a twin that has no id of its own", () => {
      expect(merged.sources).toEqual(["greenhouse", "arbeitnow"]);
      expect(merged.id).toBe(stableIdForRaw(onGreenhouse));
      expect(entry.previousOfRaw(onArbeitnow, NOW, entry.indexPrevious([merged]))).toBe(merged);
    });

    it("is none for a raw job whose key no stored record has", () => {
      const elsewhere = raw("arbeitnow", "ab-2", { company: "Globex" });
      expect(entry.previousOfRaw(elsewhere, NOW, entry.indexPrevious([merged]))).toBeUndefined();
    });

    it("is the record under the id of the raw job before one that only shares its key", () => {
      const own = normalizeJob(onGreenhouse, NIGHT_ONE)!;
      // stored after it, so the key alone would answer with the other one
      const sameKey = { ...own, id: "another-id" };
      expect(entry.previousOfRaw(onGreenhouse, NOW, entry.indexPrevious([own, sameKey]))).toBe(own);
    });

    it("lets a twin take the address and the first night of the stored role, and keep its source tag", () => {
      const tagged: Job = { ...merged, visa: "yes", visaBasis: "source", visaDeclaredAt: NIGHT_ONE };
      // the step of a run: the record found here is the stored one of the normalization
      const prior = entry.previousOfRaw(onArbeitnow, NOW, entry.indexPrevious([tagged]));
      const fresh = normalizeJob(onArbeitnow, NOW, prior, { rememberSourceVisa: true })!;
      expect(fresh).toMatchObject({
        id: tagged.id,
        firstSeen: NIGHT_ONE,
        visa: "yes",
        visaBasis: "source",
        visaDeclaredAt: NIGHT_ONE,
        carriedNights: 1,
      });
    });
  });

  describe("the lines about the roles kept from the previous refresh", () => {
    const grace = "[grace] 25 roles kept for two nights after leaving their feed";

    it("count the carried roles and the grace roles each on their own", () => {
      expect(entry.carryLines({ carriedBySource: { greenhouse: 6, himalayas: 4 }, graceCount: 25 }, 3)).toEqual([
        "[carry] 10 roles kept from the previous refresh after 3 failed feeds",
        grace,
      ]);
    });

    it("print the grace line only while a role is in grace, and the carry line on a night a feed failed", () => {
      // two feeds failed and nothing was carried: the line says so
      expect(entry.carryLines({ carriedBySource: {}, graceCount: 25 }, 2)).toEqual([
        "[carry] 0 roles kept from the previous refresh after 2 failed feeds",
        grace,
      ]);
      // no role in grace
      expect(entry.carryLines({ carriedBySource: { greenhouse: 6 }, graceCount: 0 }, 2)).toEqual([
        "[carry] 6 roles kept from the previous refresh after 2 failed feeds",
      ]);
      // a quiet night prints neither
      expect(entry.carryLines({ carriedBySource: {}, graceCount: 0 }, 0)).toEqual([]);
    });

    it("hand the sanity gate the carried roles alone, the sum of carriedBySource", () => {
      expect(entry.carriedCount({ greenhouse: 6, himalayas: 4 })).toBe(10);
      expect(entry.carriedCount({})).toBe(0);
    });
  });

  describe("a source that answered with no roles", () => {
    const NOW = "2026-11-24T03:17:00.000Z";
    // one role of greenhouse, tagged with its feed, and one of himalayas
    const lastNight: Job[] = [
      { ...job, feedUnit: "stripe" },
      { ...job, id: "j2", source: "himalayas", sources: ["himalayas"] },
    ];
    const answered = {
      source: "greenhouse",
      unit: "source",
      transient: true,
      message: "the source answered with no roles",
    };

    it("is reported when it fetched no raw job tonight and held a role last night", () => {
      expect(entry.emptyAnswers([{ id: "greenhouse", fetched: 0 }], lastNight)).toEqual([answered]);
    });

    it("is not reported when it fetched a raw job tonight", () => {
      expect(entry.emptyAnswers([{ id: "greenhouse", fetched: 1 }], lastNight)).toEqual([]);
    });

    it("is not reported when it held no role last night", () => {
      expect(entry.emptyAnswers([{ id: "adzuna", fetched: 0 }], lastNight)).toEqual([]);
      // a source the run did not fetch is not judged
      expect(entry.emptyAnswers([{ id: "greenhouse", fetched: 4 }], lastNight)).toEqual([]);
    });

    it("writes a report that carries every role of that source", () => {
      const report = entry.emptyAnswers([{ id: "greenhouse", fetched: 0 }], lastNight);
      const { carriedBySource } = carryOver({ previous: lastNight, fresh: [], failures: report, now: NOW });
      expect(carriedBySource).toEqual({ greenhouse: 1 });
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
