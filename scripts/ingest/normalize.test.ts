import { describe, expect, it } from "vitest";
import { dedupeJobs } from "./dedupe";
import { normalizeJob, stableUpdatedAt, stableVisaDeclaredAt } from "./normalize";
import type { Job, RawJob } from "../../src/lib/types";

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

describe("visaHint from source metadata", () => {
  it("marks a visa-sponsored job from the source hint", () => {
    const job = normalizeJob(
      makeRaw({
        descriptionHtml: "<p>Lead the org.</p>",
        visaHint: true,
      }),
      NOW
    );
    expect(job?.visa).toBe("yes");
  });

  it("falls back to text detection without a hint", () => {
    const noHint = normalizeJob(makeRaw({ descriptionHtml: "<p>Lead the org.</p>" }), NOW);
    expect(noHint?.visa).toBe("unknown");
    const fromText = normalizeJob(
      makeRaw({ descriptionHtml: "<p>Visa sponsorship available.</p>" }),
      NOW
    );
    expect(fromText?.visa).toBe("yes");
  });
});

describe("visa basis and evidence", () => {
  const SPONSORED = "Visa sponsorship available for exceptional candidates.";
  const REFUSAL = "We do not sponsor visas.";

  it("stores the sentence of the posting as the evidence of its visa signal", () => {
    const job = normalizeJob(makeRaw(), NOW);
    expect(job?.visa).toBe("yes");
    expect(job?.visaBasis).toBe("posting");
    expect(job?.visaEvidence).toBe(SPONSORED);
    expect(job?.visaDeclaredAt).toBeUndefined();
  });

  it("stores no basis and a null evidence when the posting says nothing about a visa", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: "<p>Lead the org.</p>" }), NOW);
    expect(job?.visa).toBe("unknown");
    expect(job?.visaBasis).toBeUndefined();
    expect(job?.visaEvidence).toBeNull();
    expect(job?.visaDeclaredAt).toBeUndefined();
  });

  it("stands on the source tag when the posting has no visa words", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: "<p>Lead the org.</p>", visaHint: true }), NOW);
    expect(job?.visa).toBe("yes");
    expect(job?.visaBasis).toBe("source");
    expect(job?.visaEvidence).toBeNull();
    expect(job?.visaDeclaredAt).toBe(NOW);
  });

  it("keeps the first night of a source tag while the tag stays", () => {
    const tagged = makeRaw({ descriptionHtml: "<p>Lead the org.</p>", visaHint: true });
    const first = normalizeJob(tagged, "2026-09-06T10:00:00.000Z")!;
    const nextNight = normalizeJob(tagged, "2026-09-13T10:00:00.000Z", first)!;
    expect(nextNight.visaDeclaredAt).toBe("2026-09-06T10:00:00.000Z");
    // the record is byte-identical, so a quiet ingest can skip the commit
    expect(nextNight.updatedAt).toBe(first.updatedAt);
  });

  it("dates a source tag with the run time when the previous record did not stand on the tag", () => {
    const before = normalizeJob(makeRaw({ descriptionHtml: "<p>Lead the org.</p>" }), "2026-09-06T10:00:00.000Z")!;
    expect(before.visaBasis).toBeUndefined();
    const tagged = normalizeJob(
      makeRaw({ descriptionHtml: "<p>Lead the org.</p>", visaHint: true }),
      "2026-09-13T10:00:00.000Z",
      before
    )!;
    expect(tagged.visaDeclaredAt).toBe("2026-09-13T10:00:00.000Z");
  });

  it("lets a refusal in the posting beat the source tag", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: `<p>${REFUSAL}</p>`, visaHint: true }), NOW);
    expect(job?.visa).toBe("no");
    expect(job?.visaBasis).toBe("posting");
    expect(job?.visaEvidence).toBe(REFUSAL);
    expect(job?.visaDeclaredAt).toBeUndefined();
  });

  it("reads the posting before the tag when both affirm sponsorship", () => {
    const job = normalizeJob(makeRaw({ visaHint: true }), NOW);
    expect(job?.visa).toBe("yes");
    expect(job?.visaBasis).toBe("posting");
    expect(job?.visaEvidence).toBe(SPONSORED);
    expect(job?.visaDeclaredAt).toBeUndefined();
  });
});

describe("relocation signal", () => {
  const OFFER = "Relocation support can be provided.";
  const REFUSAL = "Relocation assistance is not available for this position.";

  it("stores the relocation signal with its sentence, apart from the visa signal", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: `<p>${OFFER}</p>` }), NOW);
    expect(job?.relocation).toBe("yes");
    expect(job?.relocationEvidence).toBe(OFFER);
    expect(job?.visa).toBe("unknown");
    expect(job?.visaEvidence).toBeNull();
  });

  it("stores a relocation refusal with its sentence", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: `<p>${REFUSAL}</p>` }), NOW);
    expect(job?.relocation).toBe("no");
    expect(job?.relocationEvidence).toBe(REFUSAL);
  });

  it("stores a null evidence when the posting says nothing about relocation", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: "<p>Lead the org.</p>" }), NOW);
    expect(job?.relocation).toBe("unknown");
    expect(job?.relocationEvidence).toBeNull();
  });
});

describe("location restrictions", () => {
  it("stores the restriction list the raw job carries", () => {
    const job = normalizeJob(
      makeRaw({ locationRaw: "Remote, Colombia, Jamaica", locationRestrictions: ["Colombia", "Jamaica"] }),
      NOW
    );
    expect(job?.location.restrictions).toEqual(["Colombia", "Jamaica"]);
  });

  it("stores no restriction list for a raw job that names no country", () => {
    expect(normalizeJob(makeRaw({ locationRaw: "Remote" }), NOW)?.location.restrictions).toBeUndefined();
    expect(
      normalizeJob(makeRaw({ locationRaw: "Remote", locationRestrictions: [] }), NOW)?.location.restrictions
    ).toBeUndefined();
  });
});

describe("title and company entity decoding", () => {
  it("decodes basic HTML entities in raw titles and company names", () => {
    const job = normalizeJob(makeRaw({ title: "VP of Engineering &amp; Product", company: "Foo &amp; Bar Ltd" }), NOW);
    expect(job?.title).toBe("VP of Engineering & Product");
    expect(job?.company).toBe("Foo & Bar Ltd");
  });

  it("decodes numeric entities including double-escaped ones", () => {
    const job = normalizeJob(makeRaw({ title: "VP of Engineering &#038; Product", company: "hims &amp;#038; hers" }), NOW);
    expect(job?.title).toBe("VP of Engineering & Product");
    expect(job?.company).toBe("hims & hers");
  });
});

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
    expect(job?.experienceMin).toBe(10);
    expect(job?.experienceMax).toBeUndefined();
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

  it("keeps updatedAt stable when the content did not change", () => {
    const first = normalizeJob(makeRaw(), "2026-09-06T10:00:00.000Z");
    expect(first).not.toBeNull();
    const later = normalizeJob(makeRaw(), "2026-09-13T10:00:00.000Z", first!);
    expect(later?.updatedAt).toBe(first?.updatedAt);
    expect(later?.firstSeen).toBe(first?.firstSeen);

    const edited = normalizeJob(
      makeRaw({ descriptionHtml: "<p>Updated responsibilities, lead six teams.</p><h3>Requirements</h3><ul><li>10+ years</li></ul><p>Visa sponsorship available for exceptional candidates.</p>" }),
      "2026-09-13T10:00:00.000Z",
      first!
    );
    expect(edited?.updatedAt).toBe("2026-09-13T10:00:00.000Z");
  });

  it("keeps updatedAt stable for a dedupe-merged record re-normalized from both sources", () => {
    const first = normalizeJob(makeRaw(), "2026-09-06T10:00:00.000Z")!;
    const stored = { ...first, sources: ["greenhouse", "arbeitnow"] as Job["sources"] };

    // next night: both source raws re-normalize against the stored merged
    // record, whose two-source array defeats the per-raw guard
    const ghAgain = normalizeJob(makeRaw(), "2026-09-13T10:00:00.000Z", stored)!;
    const arbeitnowAgain = normalizeJob(
      makeRaw({ source: "arbeitnow", externalId: "ab-1" }),
      "2026-09-13T10:00:00.000Z",
      stored
    )!;
    const remerged = dedupeJobs([ghAgain, arbeitnowAgain]);
    expect(remerged).toHaveLength(1);
    expect(remerged[0].updatedAt).toBe("2026-09-13T10:00:00.000Z");

    // the post-dedupe guard restores the stored merged record's stamp
    const stabilized = stableUpdatedAt(remerged[0], new Map([[stored.id, stored]]));
    expect(stabilized.updatedAt).toBe(stored.updatedAt);
  });

  it("keeps the first night of a source tag on a merged record stored under the elder id", () => {
    const nightOne = "2026-09-06T10:00:00.000Z";
    const nightTwo = "2026-09-13T10:00:00.000Z";
    const richer = makeRaw({
      descriptionHtml:
        "<h3>Requirements</h3><ul><li>10+ years in engineering leadership</li><li>Scale experience</li></ul><p>Lead the org.</p>",
    });
    const tagged = makeRaw({ source: "arbeitnow", externalId: "ab-1", descriptionHtml: "<p>Lead the org.</p>", visaHint: true });
    // night one: the greenhouse twin is the elder, so the merged record is stored under its id
    const first = dedupeJobs([normalizeJob(richer, nightOne)!, normalizeJob(tagged, nightOne)!])[0];
    expect(first.source).toBe("greenhouse");
    expect(first.visaBasis).toBe("source");
    expect(first.visaDeclaredAt).toBe(nightOne);
    const stored = new Map([[first.id, first]]);
    // night two: the tagged raw finds no previous record under its own id, so its date is tonight
    const elder = normalizeJob(richer, nightTwo, stored.get(first.id))!;
    const junior = normalizeJob(tagged, nightTwo)!;
    expect(junior.id).not.toBe(first.id);
    const again = dedupeJobs([elder, junior])[0];
    expect(again.id).toBe(first.id);
    expect(again.visaDeclaredAt).toBe(nightTwo);
    const carried = stableVisaDeclaredAt(again, stored);
    expect(carried.visaDeclaredAt).toBe(nightOne);
    expect(stableUpdatedAt(carried, stored).updatedAt).toBe(first.updatedAt);
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

  it("drops a job whose apply URL is not a plain web URL", () => {
    expect(normalizeJob(makeRaw({ applyUrl: "javascript:alert(1)" }), NOW)).toBeNull();
  });

  it("drops the logo when it is not a plain web URL", () => {
    const job = normalizeJob(makeRaw({ companyLogoUrl: "javascript:alert(1)" }), NOW);
    expect(job?.companyLogoUrl).toBeUndefined();
  });

  it("ignores a structured salary hint with a malformed currency code", () => {
    const job = normalizeJob(
      makeRaw({
        source: "jobicy",
        salaryHint: { min: 240000, max: 280000, currency: "USD/year", period: "annual" },
      }),
      NOW
    );
    // falls back to the local estimate rather than a band that cannot be formatted
    expect(job?.salary?.currency).toBe("AED");
    expect(job?.salary?.source).toBe("estimated");
  });
});
