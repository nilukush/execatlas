import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getIndexEntries } from "@/lib/data";
import { SITE_URL } from "@/lib/seo";
import { defaultOrder, paginate } from "@/lib/search";

export const dynamic = "force-static";

/**
 * Pure builder so the date policy is testable: static and list pages carry the
 * dataset generation time, job pages carry their own posted date. Stamping
 * every entry with build time teaches crawlers to distrust lastmod.
 */
export function buildSitemapEntries(input: {
  generatedAt: string;
  paths: string[];
  jobs: Array<{ id: string; postedAt: string }>;
}): MetadataRoute.Sitemap {
  const { generatedAt, paths, jobs } = input;
  const generated = new Date(generatedAt);
  const entries: MetadataRoute.Sitemap = [];

  const languagesFor = (path: string) => ({
    ...Object.fromEntries(routing.locales.map((alt) => [alt, `${SITE_URL}/${alt}${path}`])),
    "x-default": `${SITE_URL}/en${path}`,
  });

  for (const path of paths) {
    for (const locale of routing.locales) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        lastModified: generated,
        changeFrequency: path === "" ? "daily" : "weekly",
        priority: path === "" ? 1 : path.startsWith("/jobs/page/") ? 0.5 : 0.8,
        alternates: { languages: languagesFor(path) },
      });
    }
  }

  for (const job of jobs) {
    const path = `/jobs/${job.id}`;
    for (const locale of routing.locales) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        lastModified: new Date(job.postedAt),
        changeFrequency: "daily",
        priority: 0.6,
        alternates: { languages: languagesFor(path) },
      });
    }
  }

  return entries;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const { generatedAt, jobs: indexEntries } = getIndexEntries();
  const { pageCount } = paginate(defaultOrder(indexEntries), 1);
  const listPages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => `/jobs/page/${i + 2}`);

  return buildSitemapEntries({
    generatedAt,
    paths: ["", "/jobs", "/about", ...listPages],
    jobs: indexEntries.map((entry) => ({ id: entry.id, postedAt: entry.postedAt })),
  });
}
