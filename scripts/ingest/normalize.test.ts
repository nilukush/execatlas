import { describe, expect, it } from "vitest";
import { normalizeJob } from "./normalize";
import type { RawJob } from "../../src/lib/types";

const NOW = "2026-09-06T10:00:00.000Z";

function makeRaw(overrides: Partial<RawJob> = {}): RawJob {
  return {
    source: "greenhouse",
    externalId: "gh-100",
    title: "Director of Engineering",
    company: "Acme Payments",
    applyUrl: "https://acme.example/careers/100",
    sourceUrl: "https://acme.example/careers/100",
    descriptionHtml:
      "<h2>About the role</h2><p>Lead four teams.</p>" +
      "<h3>Requirements</h3><ul><li>10+ years in engineering leadership</li></ul>" +
      "<p>Visa sponsorship available for exceptional candidates.</p>",
    locationRaw: "Dubai, UAE",
    postedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeJob", () => {
  it("normalizes an in-scope job with enrichment and an estimated salary", () => {
    const job = normalizeJob(makeRaw(), NOW);
    expect(job).not.toBeNull();
    expect(job?.seniority).toBe("director");
    expect(job?.domain).toBe("engineering");
    expect(job?.location.countryIso2).toBe("AE");
    expect(job?.location.region).toBe("middle-east");
    expect(job?.visa).toBe("yes");
    expect(job?.requirements).toContain("10+ years in engineering leadership");
    expect(job?.salary).toEqual({
      min: 660000,
      max: 1080000,
      currency: "AED",
      period: "annual",
      source: "estimated",
      quality: "Medium",
      familyUsed: "it-executive",
    });
    expect(job?.postedAt).toBe("2026-09-01T08:00:00.000Z");
    expect(job?.firstSeen).toBe(NOW);
    expect(job?.id).toMatch(/^acme-payments-director-of-engineering-[a-f0-9]{6}$/);
  });

  it("drops titles outside the leadership scope", () => {
    expect(normalizeJob(makeRaw({ title: "Senior Software Engineer" }), NOW)).toBeNull();
    expect(normalizeJob(makeRaw({ title: "VP of Sales" }), NOW)).toBeNull();
  });

  it("drops locations outside the six regions", () => {
    expect(normalizeJob(makeRaw({ locationRaw: "Sao Paulo, Brazil" }), NOW)).toBeNull();
    expect(normalizeJob(makeRaw({ locationRaw: "Tokyo, Japan" }), NOW)).toBeNull();
  });

  it("keeps remote roles with the remote flag and no invented salary", () => {
    const job = normalizeJob(makeRaw({ locationRaw: "Remote - Worldwide" }), NOW);
    expect(job?.location.remote).toBe(true);
    expect(job?.location.countryIso2).toBeUndefined();
    expect(job?.location.region).toBeNull();
    expect(job?.salary).toBeNull();
  });

  it("prefers a salary stated in the posting over the estimate", () => {
    const job = normalizeJob(
      makeRaw({
        descriptionHtml: "<p>Salary: AED 60,000 - 70,000 per month.</p><p>Visa sponsorship available.</p>",
      }),
      NOW
    );
    expect(job?.salary).toEqual({
      min: 60000,
      max: 70000,
      currency: "AED",
      period: "monthly",
      source: "stated",
    });
  });

  it("prefers a structured salary hint from the source API", () => {
    const job = normalizeJob(
      makeRaw({
        source: "jobicy",
        salaryHint: { min: 240000, max: 280000, currency: "USD", period: "annual" },
      }),
      NOW
    );
    expect(job?.salary?.source).toBe("stated");
    expect(job?.salary?.min).toBe(240000);
  });

  it("produces a stable id for the same source job across runs", () => {
    const a = normalizeJob(makeRaw(), NOW);
    const b = normalizeJob(makeRaw(), "2026-09-07T00:00:00.000Z");
    expect(a?.id).toBe(b?.id);
  });

  it("preserves firstSeen from a previous run", () => {
    const existing = normalizeJob(makeRaw(), "2026-08-01T00:00:00.000Z");
    const again = normalizeJob(makeRaw(), NOW, existing ?? undefined);
    expect(again?.firstSeen).toBe("2026-08-01T00:00:00.000Z");
  });

  it("detects work mode from the description", () => {
    const job = normalizeJob(
      makeRaw({ descriptionHtml: "<p>Hybrid role, 3 days per week in our Abu Dhabi office.</p>" }),
      NOW
    );
    expect(job?.workMode).toBe("hybrid");
    expect(job?.officeDays).toBe(3);
  });
});
