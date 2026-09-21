import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobLogo?: string;
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

/**
 * Jobicy public API v2 for remote jobs, with structured level and salary.
 * Docs: https://jobicy.com/jobs-api
 */
export function jobicyConnector(
  deps: FetchDeps,
  options: { count: number; tags?: string[] }
): { id: "jobicy"; run: () => Promise<RawJob[]> } {
  return {
    id: "jobicy",
    async run() {
      const out: RawJob[] = [];
      const seenIds = new Set<number>();
      // the plain feed first, then tag searches so seed queries reach roles
      // beyond the newest slice; ids dedupe across fetches
      const urls = [`https://jobicy.com/api/v2/remote-jobs?count=${options.count}`];
      for (const tag of options.tags ?? []) {
        urls.push(`https://jobicy.com/api/v2/remote-jobs?count=${options.count}&tag=${encodeURIComponent(tag)}`);
      }
      for (const url of urls) {
      try {
        const payload = (await deps.fetchJson(url)) as { jobs?: JobicyJob[] };
        for (const job of payload.jobs ?? []) {
          if (!job.id || !job.jobTitle || !job.url) continue;
          if (seenIds.has(job.id)) continue;
          seenIds.add(job.id);
          out.push({
            source: "jobicy",
            externalId: `jc-${job.id}`,
            title: job.jobTitle,
            company: job.companyName?.trim() || "Unknown company",
            companyLogoUrl: job.jobLogo || undefined,
            applyUrl: job.url,
            sourceUrl: job.url,
            descriptionHtml: job.jobDescription ?? "",
            locationRaw: job.jobGeo ?? "",
            employmentHint: job.jobType?.join(", ") || null,
            postedAt: job.pubDate ?? null,
            salaryHint:
              job.salaryMin && job.salaryMax && job.salaryCurrency
                ? {
                    min: job.salaryMin,
                    max: job.salaryMax,
                    currency: job.salaryCurrency,
                    period: job.salaryPeriod === "monthly" ? "monthly" : "annual",
                  }
                : null,
          });
        }
      } catch (error) {
        console.warn(`[jobicy] fetch failed for ${url}: ${(error as Error).message}`);
      }
      }
      return out;
    },
  };
}
