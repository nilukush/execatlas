import { describe, expect, it } from "vitest";
import { datasetProblems, shouldRunSanityGate } from "./sanity";
import type { DatasetStats } from "../../src/lib/types";

function prevStats(over: Partial<DatasetStats> = {}): DatasetStats {
  return {
    generatedAt: "2026-09-12T00:00:00.000Z",
    total: 240,
    bySource: { greenhouse: 93, workable: 143, arbeitnow: 3, jobicy: 1 },
    byRegion: {},
    byVisa: {},
    countries: 36,
    ...over,
  };
}

function jobs(sources: Record<string, number>): Array<{ source: string }> {
  const out: Array<{ source: string }> = [];
  for (const [source, n] of Object.entries(sources)) {
    for (let i = 0; i < n; i++) out.push({ source });
  }
  return out;
}

describe("datasetProblems", () => {
  it("accepts a healthy refresh against the previous stats", () => {
    const result = datasetProblems(jobs({ greenhouse: 95, workable: 140, arbeitnow: 4, jobicy: 1 }), prevStats());
    expect(result).toEqual([]);
  });

  it("rejects an empty dataset", () => {
    expect(datasetProblems([], prevStats())).not.toEqual([]);
  });

  it("rejects a total that collapsed to under half the previous run", () => {
    const result = datasetProblems(jobs({ greenhouse: 60, workable: 50 }), prevStats());
    expect(result.map((p) => p.rule)).toContain("total-floor");
  });

  it("rejects a single source collapsing even when the total holds", () => {
    // workable lost its API but greenhouse absorbed similar volume
    const result = datasetProblems(jobs({ greenhouse: 226, workable: 10, arbeitnow: 3, jobicy: 1 }), prevStats());
    expect(result.map((p) => p.rule)).toContain("source-floor");
  });

  it("still fires when a large source loses most but not all of its flow", () => {
    const result = datasetProblems(jobs({ greenhouse: 93, workable: 30, arbeitnow: 3, jobicy: 1 }), prevStats());
    expect(result.map((p) => p.rule)).toContain("source-floor");
  });

  it("tolerates a moderate shrink of a large source", () => {
    const result = datasetProblems(jobs({ greenhouse: 93, workable: 40, arbeitnow: 3, jobicy: 1 }), prevStats());
    expect(result).toEqual([]);
  });

  it("tolerates a small source returning to its baseline after a spike", () => {
    // arbeitnow spiked to 11 one night, then expired back to its usual 2 to 5;
    // the gate must not lock the spike in as a floor forever
    const prev = prevStats({ total: 250, bySource: { greenhouse: 93, workable: 143, arbeitnow: 11, jobicy: 1 } });
    expect(datasetProblems(jobs({ greenhouse: 93, workable: 143, arbeitnow: 2, jobicy: 1 }), prev)).toEqual([]);
  });

  it("still fires when a large source dies entirely", () => {
    const result = datasetProblems(jobs({ greenhouse: 93, arbeitnow: 3, jobicy: 1 }), prevStats());
    expect(result.map((p) => p.rule)).toContain("source-floor");
  });

  it("tolerates a small source fully drying up while the pipeline stays alive", () => {
    // arbeitnow fetched 700 jobs with zero in scope: alive API, empty of
    // leadership roles; the dataset must still commit
    const prev = prevStats({ total: 250, bySource: { greenhouse: 93, workable: 143, arbeitnow: 11, jobicy: 1 } });
    expect(datasetProblems(jobs({ greenhouse: 93, workable: 143, jobicy: 1 }), prev)).toEqual([]);
  });

  it("ignores small sources so a tiny board drying up is not fatal", () => {
    const result = datasetProblems(jobs({ greenhouse: 93, workable: 146, jobicy: 1 }), prevStats());
    expect(result).toEqual([]);
  });

  it("requires a minimum size when no previous stats exist", () => {
    expect(datasetProblems(jobs({ greenhouse: 25 }), null)).toEqual([]);
    expect(datasetProblems(jobs({ greenhouse: 10 }), null).map((p) => p.rule)).toContain("minimum");
  });
});

describe("shouldRunSanityGate", () => {
  it("gates full runs", () => {
    expect(shouldRunSanityGate({ smoke: false, only: false, force: false })).toBe(true);
  });

  it("skips smoke and single-source runs, which are connectivity checks and would always trip the floors", () => {
    expect(shouldRunSanityGate({ smoke: true, only: false, force: false })).toBe(false);
    expect(shouldRunSanityGate({ smoke: false, only: true, force: false })).toBe(false);
  });

  it("skips forced runs", () => {
    expect(shouldRunSanityGate({ smoke: false, only: false, force: true })).toBe(false);
  });
});
