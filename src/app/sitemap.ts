import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getAllJobIds } from "@/lib/data";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["", "/jobs", "/about"];
  const jobIds = getAllJobIds();

  const entries: MetadataRoute.Sitemap = [];

  for (const path of staticPaths) {
    for (const locale of routing.locales) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        lastModified: now,
        changeFrequency: path === "" ? "daily" : "weekly",
        priority: path === "" ? 1 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((alt) => [alt, `${SITE_URL}/${alt}${path}`])
          ),
        },
      });
    }
  }

  for (const id of jobIds) {
    for (const locale of routing.locales) {
      entries.push({
        url: `${SITE_URL}/${locale}/jobs/${id}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.6,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((alt) => [alt, `${SITE_URL}/${alt}/jobs/${id}`])
          ),
        },
      });
    }
  }

  return entries;
}
