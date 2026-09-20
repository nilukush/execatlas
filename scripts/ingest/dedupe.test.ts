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

describe("groupCountryVariants", () => {
  it("groups same-source per-country postings of one role into variants", () => {
    const countries = ["Riga, Latvia", "Belgrade, Serbia", "Warsaw, Poland", "Tbilisi, Georgia", "Limassol, Cyprus"];
    const raws = countries.map((locationRaw, i) =>
      job({
        source: "workable",
        externalId: `wk-${i}`,
        title: "Engineering Director - Platform",
        company: "GoMining",
        locationRaw,
        applyUrl: `https://gomining.example/apply/${i}`,
        sourceUrl: `https://gomining.example/apply/${i}`,
        postedAt: "2026-09-05T14:31:36.000Z",
      })
    );
    const grouped = dedupeJobs(raws.filter(notNull));
    expect(grouped).toHaveLength(1);
    expect(grouped[0].variants).toHaveLength(4);
    const names = grouped[0].variants!.map((v) => v.countryName).sort();
    expect(names).toEqual(["Cyprus", "Georgia", "Latvia", "Poland", "Serbia"].filter((n) => n !== grouped[0].location.countryName));
    for (const v of grouped[0].variants!) {
      expect(v.applyUrl).toMatch(/^https:\/\/gomining\.example\/apply\/\d+$/);
    }
  });

  it("keeps postings of the same role months apart separate", () => {
    const fresh = job({ source: "workable", externalId: "wk-f", title: "Director of Engineering", company: "Acme", locationRaw: "Warsaw, Poland", postedAt: "2026-09-02T00:00:00.000Z" });
    const old = job({ source: "workable", externalId: "wk-o", title: "Director of Engineering", company: "Acme", locationRaw: "Madrid, Spain", postedAt: "2026-03-02T00:00:00.000Z" });
    const grouped = dedupeJobs([fresh, old].filter(notNull));
    expect(grouped).toHaveLength(2);
    expect(grouped[0].variants ?? []).toHaveLength(0);
  });

  it("does not group different titles or companies that share a country batch", () => {
    const a = job({ source: "workable", externalId: "wk-a", title: "Director of Engineering", company: "Acme", locationRaw: "Warsaw, Poland" });
    const b = job({ source: "workable", externalId: "wk-b", title: "Head of Platform Engineering", company: "Acme", locationRaw: "Madrid, Spain" });
    const c = job({ source: "workable", externalId: "wk-c", title: "Director of Engineering", company: "Beta", locationRaw: "Riga, Latvia" });
    const grouped = dedupeJobs([a, b, c].filter(notNull));
    expect(grouped).toHaveLength(3);
  });

});

describe("variant collapse details", () => {
  it("keeps a same-country office sibling of a remote-qualified primary", () => {
    const remoteUk = job({ source: "workable", externalId: "wk-r", title: "Director of Engineering", company: "Acme", locationRaw: "Remote, United Kingdom", applyUrl: "https://acme.example/r", sourceUrl: "https://acme.example/r", companyLogoUrl: "https://acme.example/logo.png" });
    const officeUk = job({ source: "workable", externalId: "wk-o", title: "Director of Engineering", company: "Acme", locationRaw: "London, UK", applyUrl: "https://acme.example/o", sourceUrl: "https://acme.example/o" });
    const grouped = dedupeJobs([remoteUk, officeUk].filter(notNull));
    expect(grouped).toHaveLength(1);
    // the stated salary makes the remote record the deterministic primary
    expect(grouped[0].location.remote).toBe(true);
    expect(grouped[0].variants ?? []).toHaveLength(1);
    const urls = new Set([grouped[0].applyUrl, ...(grouped[0].variants ?? []).map((v) => v.applyUrl)]);
    expect(urls).toEqual(new Set([remoteUk?.applyUrl, officeUk?.applyUrl].filter(Boolean) as string[]));
  });

  it("stamps the group with the earliest posting date and first-seen", () => {
    const earlier = job({ source: "workable", externalId: "wk-e", title: "Director of Engineering", company: "Acme", locationRaw: "Warsaw, Poland", postedAt: "2026-09-05T02:00:00.000Z" });
    const later = job({ source: "workable", externalId: "wk-l", title: "Director of Engineering", company: "Acme", locationRaw: "Madrid, Spain", postedAt: "2026-09-05T20:00:00.000Z", applyUrl: "https://acme.example/l", sourceUrl: "https://acme.example/l", companyLogoUrl: "https://acme.example/logo.png" });
    const grouped = dedupeJobs([later, earlier].filter(notNull));
    // the logo makes the later posting the deterministic primary, but the group keeps the earliest facts
    expect(grouped[0].location.countryIso2).toBe("ES");
    expect(grouped[0].postedAt).toBe("2026-09-05T02:00:00.000Z");
    expect(grouped[0].firstSeen).toBe(earlier?.firstSeen);
  });
});

describe("dedupeJobs", () => {
  it("merges remote postings of the same role that differ only by country qualifier", () => {
    const uk = job({ externalId: "gh-uk", locationRaw: "Remote, United Kingdom" });
    const bare = job({ externalId: "gh-bare", source: "arbeitnow", locationRaw: "Remote" });
    const merged = dedupeJobs([uk, bare].filter(notNull));
    expect(merged).toHaveLength(1);
    expect(merged[0].sources.sort()).toEqual(["arbeitnow", "greenhouse"]);
  });

  it("keeps the country-qualified location when a bare remote twin is richer", () => {
    const qualified = job({ externalId: "gh-uk", locationRaw: "Remote, United Kingdom" });
    const bare = job({
      externalId: "wk-bare",
      source: "workable",
      locationRaw: "Remote",
      descriptionHtml: "<h3>Requirements</h3><ul><li>12+ years</li><li>Scale experience</li><li>Visa sponsorship available.</li></ul><p>Long detailed description text that makes this record richer than the qualified one so it wins the primary pick.</p>",
    });
    const merged = dedupeJobs([qualified, bare].filter(notNull));
    expect(merged).toHaveLength(1);
    // specific beats vague: the surviving record must not lose the UK qualifier
    expect(merged[0].location.countryIso2).toBe("GB");
  });

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

  it("groups identical per-country postings and keeps distinct requisitions apart", () => {
    const a = job({ externalId: "gh-1", locationRaw: "Dubai, UAE", applyUrl: "https://acme.example/dubai", sourceUrl: "https://acme.example/dubai" });
    const b = job({ externalId: "gh-2", locationRaw: "London, UK", applyUrl: "https://acme.example/london", sourceUrl: "https://acme.example/london" });
    // same description and timestamp: one role posted per country
    const grouped = dedupeJobs([a, b].filter(notNull));
    expect(grouped).toHaveLength(1);
    const pair = [grouped[0].location.countryIso2, grouped[0].variants?.[0].countryIso2].sort();
    expect(pair).toEqual(["AE", "GB"]);

    const differentReq = job({
      externalId: "gh-3",
      locationRaw: "London, UK",
      descriptionHtml: "<p>A genuinely different requisition with its own screening process and requirements text.</p>",
    });
    expect(dedupeJobs([a, differentReq].filter(notNull))).toHaveLength(2);
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
