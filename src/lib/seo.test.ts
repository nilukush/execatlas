import { describe, expect, it } from "vitest";
import {
  buildAlternates,
  formatDate,
  jobOgDescription,
  jobPostingJsonLd,
  SITE_URL,
} from "./seo";
import { countryByIso2 } from "./locations";
import type { Job } from "./types";

const NOW = "2026-11-24T00:00:00.000Z";

function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: "j1",
    title: "Director of Engineering",
    company: "Acme",
    companyLogoUrl: "https://acme.example/logo.png",
    applyUrl: "https://acme.example/jobs/1",
    sourceUrl: "https://acme.example/jobs/1",
    source: "greenhouse",
    sources: ["greenhouse"],
    text: "We are hiring a Director of Engineering.",
    blocks: [],
    requirements: [],
    location: { countryIso2: "DE", countryName: "Germany", region: "europe", remote: false, raw: "Berlin" },
    seniority: "director",
    domain: "engineering",
    visa: "unknown",
    workMode: "onsite",
    roleType: "permanent",
    salary: null,
    postedAt: NOW,
    firstSeen: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("jobPostingJsonLd", () => {
  const estimated = makeJob({
    salary: { min: 660000, max: 1080000, currency: "AED", period: "annual", source: "estimated" },
  });
  const stated = makeJob({
    salary: { min: 60000, max: 80000, currency: "AED", period: "monthly", source: "stated" },
  });

  it("leaves out baseSalary for an estimated band and for no band", () => {
    expect(jobPostingJsonLd(estimated, "en")).not.toHaveProperty("baseSalary");
    expect(jobPostingJsonLd(makeJob(), "en")).not.toHaveProperty("baseSalary");
  });

  it("states baseSalary for a stated band", () => {
    expect(jobPostingJsonLd(stated, "en").baseSalary).toEqual({
      "@type": "MonetaryAmount",
      currency: "AED",
      value: {
        "@type": "QuantitativeValue",
        minValue: 60000,
        maxValue: 80000,
        unitText: "MONTH",
      },
    });
  });

  it("never claims directApply", () => {
    expect(jobPostingJsonLd(estimated, "en")).not.toHaveProperty("directApply");
    expect(jobPostingJsonLd(stated, "en")).not.toHaveProperty("directApply");
  });

  it("keeps title, datePosted, hiringOrganization and url as the page built them", () => {
    expect(jobPostingJsonLd(stated, "hi")).toMatchObject({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Director of Engineering",
      datePosted: NOW,
      hiringOrganization: {
        "@type": "Organization",
        name: "Acme",
        logo: "https://acme.example/logo.png",
      },
      jobLocation: {
        "@type": "Place",
        address: { "@type": "PostalAddress", addressCountry: "DE", addressRegion: countryByIso2("DE")?.name },
      },
      url: `${SITE_URL}/hi/jobs/j1`,
    });
  });
});

describe("formatDate", () => {
  it("pins to the UTC calendar day so the static build and every browser agree", () => {
    // 22:55 UTC is already the next day in UTC+4 visitors' browsers
    expect(formatDate("2026-09-11T22:55:14.000Z", "en")).toBe("11 Sept 2026");
  });

  it("formats a date-only timestamp as the same day in any timezone", () => {
    expect(formatDate("2026-09-11", "en")).toBe("11 Sept 2026");
  });

  it("passes through values that are not dates", () => {
    expect(formatDate("negotiable", "en")).toBe("negotiable");
  });
});

describe("buildAlternates", () => {
  it("adds x-default hreflang pointing at the default locale", () => {
    const { languages } = buildAlternates("ar", "/jobs");
    expect(languages["x-default"]).toBe(`${SITE_URL}/en/jobs`);
    expect(languages.ar).toBe(`${SITE_URL}/ar/jobs`);
  });
});

describe("jobOgDescription", () => {
  const tail = "See the full role, salary band and apply link on ExecAtlas.";

  it("composes a shareable summary from title, company and place", () => {
    expect(jobOgDescription("VP of Engineering", "Acme", "United Arab Emirates", tail))
      .toBe("VP of Engineering at Acme in United Arab Emirates. " + tail);
  });

  it("omits the place clause when there is none", () => {
    expect(jobOgDescription("CTO", "Acme", null, tail))
      .toBe("CTO at Acme. " + tail);
  });
});
