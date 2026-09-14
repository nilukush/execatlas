import { describe, expect, it } from "vitest";
import { parseDataset } from "./data";
import { DATASET_VERSION } from "./types";

const good = JSON.stringify({ version: DATASET_VERSION, generatedAt: "2026-09-13T00:00:00.000Z", jobs: [{ id: "j1" }] });

describe("parseDataset", () => {
  it("parses a versioned dataset with jobs", () => {
    const parsed = parseDataset<{ version: number; jobs: Array<{ id: string }> }>(good, "jobs.json");
    expect(parsed.jobs).toHaveLength(1);
  });

  it("throws on corrupt JSON instead of failing open to an empty site", () => {
    expect(() => parseDataset("{ truncated", "jobs.json")).toThrow(/jobs\.json/);
  });

  it("throws on a version mismatch", () => {
    const oldVersion = JSON.stringify({ version: 1, generatedAt: "", jobs: [{ id: "j1" }] });
    expect(() => parseDataset(oldVersion, "jobs.json")).toThrow(/version/i);
  });

  it("throws on a missing or empty jobs array", () => {
    expect(() => parseDataset(JSON.stringify({ version: DATASET_VERSION, jobs: [] }), "jobs.json")).toThrow(/empty/i);
    expect(() =>
      parseDataset(JSON.stringify({ version: DATASET_VERSION, generatedAt: "" }), "jobs.json")
    ).toThrow(/empty/i);
  });
});
