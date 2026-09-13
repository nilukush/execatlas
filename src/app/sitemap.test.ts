import { describe, expect, it } from "vitest";
import { buildSitemapEntries } from "./sitemap";
import { SITE_URL } from "@/lib/seo";

describe("buildSitemapEntries", () => {
  const entries = buildSitemapEntries({
    generatedAt: "2026-09-13T08:00:00.000Z",
    paths: ["", "/jobs", "/about", "/jobs/page/2"],
    jobs: [
      { id: "a", postedAt: "2026-09-10T22:55:14.000Z" },
      { id: "b", postedAt: "2026-08-01" },
    ],
  });

  it("emits one entry per locale per path plus per job", () => {
    expect(entries).toHaveLength(4 * 4 + 2 * 4);
  });

  it("stamps static and list pages with the dataset generation time", () => {
    const home = entries.find((e) => e.url === `${SITE_URL}/en`);
    expect(home?.lastModified).toEqual(new Date("2026-09-13T08:00:00.000Z"));
  });

  it("stamps job detail pages with the job's own posted date", () => {
    const jobEn = entries.find((e) => e.url === `${SITE_URL}/en/jobs/a`);
    expect(jobEn?.lastModified).toEqual(new Date("2026-09-10T22:55:14.000Z"));
    const jobAr = entries.find((e) => e.url === `${SITE_URL}/ar/jobs/b`);
    expect(jobAr?.lastModified).toEqual(new Date("2026-08-01"));
  });

  it("includes x-default alternates pointing at the default locale", () => {
    const jobEn = entries.find((e) => e.url === `${SITE_URL}/en/jobs/a`);
    expect(jobEn?.alternates?.languages?.["x-default"]).toBe(`${SITE_URL}/en/jobs/a`);
  });
});
