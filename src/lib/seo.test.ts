import { describe, expect, it } from "vitest";
import { buildAlternates, formatDate, jobOgDescription, SITE_URL } from "./seo";

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
