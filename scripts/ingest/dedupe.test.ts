import { describe, expect, it } from "vitest";
import { dedupeJobs } from "./dedupe";
import { normalizeJob } from "./normalize";
import type { Job, RawJob } from "../../src/lib/types";

const notNull = (job: Job | null): job is Job => job !== null;

const NOW = "2026-09-06T10:00:00.000Z";

function job(overrides: Partial<RawJob>): ReturnType<typeof normalizeJob> {
  return normalizeJob(
    {
      source: "greenhouse",
      externalId: "gh-1",
      title: "VP of Engineering",
      company: "Acme",
      applyUrl: "https://acme.example/1",
      sourceUrl: "https://acme.example/1",
      descriptionHtml: "<p>Lead the org.</p>",
      locationRaw: "Dubai, UAE",
      postedAt: "2026-09-02T00:00:00.000Z",
      ...overrides,
    },
    NOW
  );
}

describe("dedupeJobs", () => {
  it("merges the same role found on two sources", () => {
    const fromGreenhouse = job({
      source: "greenhouse",
      externalId: "gh-1",
      descriptionHtml: "<h3>Requirements</h3><ul><li>12+ years</li></ul><p>Visa sponsorship available.</p>",
    });
    const fromWorkable = job({
      source: "workable",
      externalId: "wk-9",
      descriptionHtml: "<p>Lead the org.</p>",
      applyUrl: "https://acme.example/2",
      postedAt: "2026-08-30T00:00:00.000Z",
    });
    const merged = dedupeJobs([fromGreenhouse, fromWorkable].filter(notNull));
    expect(merged).toHaveLength(1);
    expect(merged[0].sources.sort()).toEqual(["greenhouse", "workable"]);
    // the richer record (with requirements) wins
    expect(merged[0].requirements).toContain("12+ years");
    // earliest posting date survives the merge
    expect(merged[0].postedAt).toBe("2026-08-30T00:00:00.000Z");
  });

  it("treats ampersand and 'and' titles as the same role", () => {
    const a = job({ title: "VP of Engineering and Product", externalId: "gh-1" });
    const b = job({ title: "VP Engineering & Product", source: "workable", externalId: "wk-2" });
    expect(dedupeJobs([a, b].filter(notNull))).toHaveLength(1);
  });

  it("keeps jobs in different countries apart", () => {
    const a = job({ externalId: "gh-1", locationRaw: "Dubai, UAE" });
    const b = job({ externalId: "gh-2", locationRaw: "London, UK" });
    expect(dedupeJobs([a, b].filter(notNull))).toHaveLength(2);
  });

  it("upgrades visa signal from unknown when a duplicate source knows more", () => {
    const unknownVisa = job({ externalId: "gh-1", descriptionHtml: "<p>Lead the org.</p>" });
    const yesVisa = job({
      source: "workable",
      externalId: "wk-2",
      descriptionHtml: "<p>We offer visa sponsorship.</p>",
    });
    const merged = dedupeJobs([unknownVisa, yesVisa].filter(notNull));
    expect(merged[0].visa).toBe("yes");
  });
});
