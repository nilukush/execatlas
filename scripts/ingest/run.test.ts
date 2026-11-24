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
});
