import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  job_types?: string[];
  location?: string;
  created_at?: number;
}

/**
 * Arbeitnow free public job board API (Germany/EU focused, hourly updates).
 * Docs: https://www.arbeitnow.com/blog/job-board-api
 */
export function arbeitnowConnector(
  deps: FetchDeps,
  options: { pages: number }
): { id: "arbeitnow"; run: () => Promise<RawJob[]> } {
  return {
    id: "arbeitnow",
    async run() {
      const out: RawJob[] = [];
      for (let page = 1; page <= options.pages; page += 1) {
        try {
          const payload = (await deps.fetchJson(
            `https://www.arbeitnow.com/api/job-board-api?page=${page}`
          )) as { data?: ArbeitnowJob[] };
          const jobs = payload.data ?? [];
          if (jobs.length === 0) break;
          for (const job of jobs) {
            if (!job.slug || !job.title || !job.url) continue;
            out.push({
              source: "arbeitnow",
              externalId: `an-${job.slug}`,
              title: job.title,
              company: job.company_name?.trim() || "Unknown company",
              applyUrl: job.url,
              sourceUrl: job.url,
              descriptionHtml: job.description ?? "",
              locationRaw: job.location ?? "",
              remoteHint: job.remote === true,
              employmentHint: job.job_types?.length ? job.job_types.join(", ") : null,
              postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
            });
          }
        } catch (error) {
          console.warn(`[arbeitnow] page ${page} failed: ${(error as Error).message}`);
        }
      }
      // cross-reference the visa_sponsorship=true feed: their platform-declared
      // sponsorship flag is not in the per-job payload, only in this filter
      try {
        const sponsoredSlugs = new Set<string>();
        for (let page = 1; page <= options.pages; page += 1) {
          const filtered = (await deps.fetchJson(
            `https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true&page=${page}`
          )) as { data?: ArbeitnowJob[] };
          const slugs = (filtered.data ?? []).map((job) => job.slug).filter(Boolean);
          if (slugs.length === 0) break;
          for (const slug of slugs) sponsoredSlugs.add(slug);
        }
        if (sponsoredSlugs.size > 0) {
          for (const job of out) {
            const slug = job.externalId.replace(/^an-/, "");
            if (sponsoredSlugs.has(slug)) job.visaHint = true;
          }
        }
      } catch (error) {
        console.warn(`[arbeitnow] visa feed failed: ${(error as Error).message}`);
      }
      return out;
    },
  };
}
