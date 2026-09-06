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
  options: { count: number }
): { id: "jobicy"; run: () => Promise<RawJob[]> } {
  return {
    id: "jobicy",
    async run() {
      const out: RawJob[] = [];
      try {
        const payload = (await deps.fetchJson(
          `https://jobicy.com/api/v2/remote-jobs?count=${options.count}`
        )) as { jobs?: JobicyJob[] };
        for (const job of payload.jobs ?? []) {
          if (!job.id || !job.jobTitle || !job.url) continue;
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
        console.warn(`[jobicy] failed: ${(error as Error).message}`);
      }
      return out;
    },
  };
}
