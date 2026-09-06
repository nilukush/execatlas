import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getAllJobIds, getIndexEntries } from "@/lib/data";
import { SITE_URL } from "@/lib/seo";
import { defaultOrder, paginate } from "@/lib/search";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["", "/jobs", "/about"];
  const jobIds = getAllJobIds();
  const { jobs: indexEntries } = getIndexEntries();
  const { pageCount } = paginate(defaultOrder(indexEntries), 1);
  const listPages = Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => `/jobs/page/${i + 2}`);

  const entries: MetadataRoute.Sitemap = [];

  for (const path of [...staticPaths, ...listPages]) {
    for (const locale of routing.locales) {
      entries.push({
        url: `${SITE_URL}/${locale}${path}`,
        lastModified: now,
        changeFrequency: path === "" ? "daily" : "weekly",
        priority: path === "" ? 1 : path.startsWith("/jobs/page/") ? 0.5 : 0.8,
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
