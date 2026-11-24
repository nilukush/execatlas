import { describe, expect, it } from "vitest";
import { dedupeJobs } from "./dedupe";
import {
  normalizeJob,
  stableId,
  stableIdForRaw,
  stableJob,
  stableUpdatedAt,
  stableVisaDeclaredAt,
} from "./normalize";
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

describe("feed and source home carried from the raw job", () => {
  it("keeps the feed that returned the job", () => {
    expect(normalizeJob(makeRaw({ feedUnit: "stripe" }), NOW)?.feedUnit).toBe("stripe");
  });

  it("keeps the source home, and writes none for a job that has none", () => {
    expect(normalizeJob(makeRaw({ sourceHome: "https://www.adzuna.com" }), NOW)?.sourceHome).toBe(
      "https://www.adzuna.com"
    );
    const stored = JSON.parse(JSON.stringify(normalizeJob(makeRaw(), NOW)));
    expect(stored).not.toHaveProperty("sourceHome");
    expect(stored).not.toHaveProperty("feedUnit");
  });
});

describe("rememberSourceVisa: the visa feed failed tonight", () => {
  const NIGHT_ONE = "2026-09-06T10:00:00.000Z";
  const NIGHT_TWO = "2026-09-13T10:00:00.000Z";
  const QUIET = "<p>Lead the org.</p>";

  function storedTag(): Job {
    return normalizeJob(makeRaw({ descriptionHtml: QUIET, visaHint: true }), NIGHT_ONE)!;
  }

  it("keeps the stored source tag when the raw job carries none and the posting says nothing", () => {
    const remembered = normalizeJob(makeRaw({ descriptionHtml: QUIET }), NIGHT_TWO, storedTag(), {
      rememberSourceVisa: true,
    })!;
    expect(remembered.visa).toBe("yes");
    expect(remembered.visaBasis).toBe("source");
    expect(remembered.visaEvidence).toBeNull();
    expect(remembered.visaDeclaredAt).toBe(NIGHT_ONE);
    // the night counts on the carry counter; the content did not change, so the stamp stands
    expect(remembered.carriedNights).toBe(1);
    expect(remembered.updatedAt).toBe(NIGHT_ONE);
  });

  it("counts the remembered nights on carriedNights, three at most, and reads unknown on the fourth", () => {
    const NIGHT_THREE = "2026-09-20T10:00:00.000Z";
    const NIGHT_FOUR = "2026-09-27T10:00:00.000Z";
    const NIGHT_FIVE = "2026-10-04T10:00:00.000Z";
    const remember = { rememberSourceVisa: true };
    const second = normalizeJob(
      makeRaw({ descriptionHtml: QUIET }),
      NIGHT_THREE,
      { ...storedTag(), carriedNights: 1 },
      remember
    )!;
    expect(second).toMatchObject({ visa: "yes", carriedNights: 2, visaDeclaredAt: NIGHT_ONE });
    const third = normalizeJob(makeRaw({ descriptionHtml: QUIET }), NIGHT_FOUR, second, remember)!;
    expect(third).toMatchObject({ visa: "yes", carriedNights: 3, visaDeclaredAt: NIGHT_ONE });
    // the source has not confirmed the tag for four nights
    const fourth = normalizeJob(makeRaw({ descriptionHtml: QUIET }), NIGHT_FIVE, third, remember)!;
    expect(fourth.visa).toBe("unknown");
    expect(fourth.visaBasis).toBeUndefined();
    expect(fourth.visaDeclaredAt).toBeUndefined();
    expect(fourth).not.toHaveProperty("carriedNights");
    expect(fourth.updatedAt).toBe(NIGHT_FIVE);
  });

  it("leaves carriedNights absent on a night the tag is present", () => {
    const job = normalizeJob(
      makeRaw({ descriptionHtml: QUIET, visaHint: true }),
      NIGHT_TWO,
      { ...storedTag(), carriedNights: 3 }
    )!;
    expect(job.visa).toBe("yes");
    expect(job.visaBasis).toBe("source");
    expect(job.visaDeclaredAt).toBe(NIGHT_ONE);
    expect(job).not.toHaveProperty("carriedNights");
  });

  it("reads an unknown signal again without the option", () => {
    const forgotten = normalizeJob(makeRaw({ descriptionHtml: QUIET }), NIGHT_TWO, storedTag())!;
    expect(forgotten.visa).toBe("unknown");
    expect(forgotten.visaBasis).toBeUndefined();
    expect(forgotten.visaDeclaredAt).toBeUndefined();
  });

  it("remembers nothing from a stored record that does not stand on a source tag", () => {
    const plain = normalizeJob(makeRaw({ descriptionHtml: QUIET }), NIGHT_ONE)!;
    const job = normalizeJob(makeRaw({ descriptionHtml: QUIET }), NIGHT_TWO, plain, { rememberSourceVisa: true })!;
    expect(job.visa).toBe("unknown");
    expect(job.visaBasis).toBeUndefined();
    expect(job).not.toHaveProperty("carriedNights");
  });

  it("dates a remembered tag with the run time when the stored record has no date", () => {
    const undated: Job = { ...storedTag(), visaDeclaredAt: undefined };
    const job = normalizeJob(makeRaw({ descriptionHtml: QUIET }), NIGHT_TWO, undated, { rememberSourceVisa: true })!;
    expect(job.visaDeclaredAt).toBe(NIGHT_TWO);
  });

  it("lets a refusal in the posting beat the remembered tag", () => {
    const REFUSAL = "We do not sponsor visas.";
    const job = normalizeJob(makeRaw({ descriptionHtml: `<p>${REFUSAL}</p>` }), NIGHT_TWO, storedTag(), {
      rememberSourceVisa: true,
    })!;
    expect(job.visa).toBe("no");
    expect(job.visaBasis).toBe("posting");
    expect(job.visaEvidence).toBe(REFUSAL);
    expect(job.visaDeclaredAt).toBeUndefined();
  });

  it("lets an affirmation in the posting beat the remembered tag", () => {
    const job = normalizeJob(makeRaw(), NIGHT_TWO, storedTag(), { rememberSourceVisa: true })!;
    expect(job.visa).toBe("yes");
    expect(job.visaBasis).toBe("posting");
    expect(job.visaEvidence).toBe("Visa sponsorship available for exceptional candidates.");
    expect(job.visaDeclaredAt).toBeUndefined();
  });
});

describe("stableIdForRaw", () => {
  it("builds the lookup key of a raw job from the decoded company and title, as the stored id is built", () => {
    const raw = makeRaw({ title: "VP of Engineering &amp; Product", company: "Acme &amp; Co" });
    expect(stableIdForRaw(raw)).toBe(normalizeJob(raw, NOW)?.id);
    // the undecoded form is another key: it would miss the previous record every night
    expect(stableIdForRaw(raw)).not.toBe(stableId(raw.company, raw.title, raw.source, raw.externalId));
  });
});

describe("stableJob", () => {
  it("restores the kept tag date before the content comparison, so an unchanged merged record keeps its stamp", () => {
    const nightOne = "2026-09-06T10:00:00.000Z";
    const nightTwo = "2026-09-13T10:00:00.000Z";
    const richer = makeRaw({
      descriptionHtml:
        "<h3>Requirements</h3><ul><li>10+ years in engineering leadership</li><li>Scale experience</li></ul><p>Lead the org.</p>",
    });
    const tagged = makeRaw({ source: "arbeitnow", externalId: "ab-1", descriptionHtml: "<p>Lead the org.</p>", visaHint: true });
    const first = dedupeJobs([normalizeJob(richer, nightOne)!, normalizeJob(tagged, nightOne)!])[0];
    const stored = new Map([[first.id, first]]);
    const again = dedupeJobs([normalizeJob(richer, nightTwo, first)!, normalizeJob(tagged, nightTwo)!])[0];

    // swapped, the comparison reads tonight's date as a change and keeps tonight's stamp
    expect(stableVisaDeclaredAt(stableUpdatedAt(again, stored), stored).updatedAt).toBe(nightTwo);
    // the one difference is the last-seen stamp, which is the run time of every night a feed lists the role
    expect(stableJob(again, stored)).toEqual({ ...first, lastSeenAt: nightTwo });
  });
});

describe("last seen and the one year limit", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const postedDaysAgo = (days: number) => new Date(Date.parse(NOW) - days * DAY_MS).toISOString();

  it("dates a fresh role with the run time as last seen", () => {
    const first = normalizeJob(makeRaw(), NOW)!;
    expect(first.lastSeenAt).toBe(NOW);
    // the stamp moves every night the feed lists the role, and updatedAt does not
    const later = normalizeJob(makeRaw(), "2026-09-13T10:00:00.000Z", first)!;
    expect(later.lastSeenAt).toBe("2026-09-13T10:00:00.000Z");
    expect(later.updatedAt).toBe(first.updatedAt);
  });

  it("drops a role posted more than 365 whole days before the run, and keeps one at 365 days", () => {
    expect(normalizeJob(makeRaw({ postedAt: postedDaysAgo(366) }), NOW)).toBeNull();
    expect(normalizeJob(makeRaw({ postedAt: postedDaysAgo(365) }), NOW)).not.toBeNull();
  });

  it("judges a raw role that states no posted date by the date of its stored record", () => {
    // the pipeline dates such a role with the night it was first seen
    const stored = normalizeJob(makeRaw({ postedAt: null }), postedDaysAgo(400))!;
    expect(normalizeJob(makeRaw({ postedAt: null }), NOW, stored)).toBeNull();
    expect(normalizeJob(makeRaw({ postedAt: null }), NOW)).not.toBeNull();
  });

  it("keeps the expiry date of the raw job, and writes none for a job that has none", () => {
    const expiresAt = "2026-12-01T00:00:00.000Z";
    expect(normalizeJob(makeRaw({ expiresAt }), NOW)?.expiresAt).toBe(expiresAt);
    expect(normalizeJob(makeRaw(), NOW)).not.toHaveProperty("expiresAt");
  });

  it("keeps updatedAt when only the feed, the last-seen stamp or the night counters differ", () => {
    const first = normalizeJob(makeRaw(), NOW)!;
    const stored: Job = { ...first, feedUnit: "page-1", carriedNights: 2, absentNights: 1 };
    const later = normalizeJob(makeRaw({ feedUnit: "page-2" }), "2026-09-13T10:00:00.000Z", stored)!;
    expect(later.updatedAt).toBe(first.updatedAt);
    expect(later.lastSeenAt).toBe("2026-09-13T10:00:00.000Z");
    expect(later.feedUnit).toBe("page-2");
    expect(later).not.toHaveProperty("carriedNights");
    expect(later).not.toHaveProperty("absentNights");
  });
});

describe("R39: a stated band passes the plausibility check before it is stored", () => {
  const ESTIMATED = {
    min: 660000,
    max: 1080000,
    currency: "AED",
    period: "annual",
    source: "estimated",
    quality: "Medium",
    familyUsed: "it-executive",
  };

  it("gives a United Arab Emirates role the estimated band when the text states the revenue of its clients", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: "<p>Our clients generate $1M to $100M in revenue.</p>" }), NOW);
    expect(job?.salary).toEqual(ESTIMATED);
  });

  it("keeps a stated band that is plausible pay", () => {
    const job = normalizeJob(makeRaw({ descriptionHtml: "<p>Salary: $200,000 to $260,000 a year.</p>" }), NOW);
    expect(job?.salary).toEqual({ min: 200000, max: 260000, currency: "USD", period: "annual", source: "stated" });
  });

  it("gives a Himalayas role the estimated band when its salary hint is not plausible pay", () => {
    const job = normalizeJob(
      makeRaw({
        source: "himalayas",
        salaryHint: { min: 25000000, max: 50000000, currency: "USD", period: "annual" },
      }),
      NOW
    );
    expect(job?.salary).toEqual(ESTIMATED);
  });
});
