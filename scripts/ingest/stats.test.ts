import { describe, expect, it } from "vitest";
import { computeStats } from "./run";
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
  it("reports every configured source, zeros included", () => {
    const stats = computeStats([base], "2026-09-20T00:00:00.000Z");
    expect(stats.bySource).toMatchObject({ greenhouse: 1, workable: 0, arbeitnow: 0, jobicy: 0, lever: 0 });
  });
});
