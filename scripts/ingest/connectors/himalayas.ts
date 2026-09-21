import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface HimalayasJob {
  guid: string;
  title: string;
  companyName: string;
  companyLogo?: string;
  applicationLink: string;
  locationRestrictions?: string[];
  pubDate?: number;
  employmentType?: string;
  description?: string;
  minSalary?: number;
  maxSalary?: number;
  currency?: string;
  salaryPeriod?: string;
}

// their period vocabulary maps onto ours; anything else (hourly) is skipped
// rather than annualized into a misleading band
const PERIOD_MAP: Record<string, "annual" | "monthly"> = {
  Year: "annual",
  "Per Year": "annual",
  Month: "monthly",
  "Per Month": "monthly",
};

/**
 * Himalayas free remote-jobs API, no key. The firehose holds 100k+ jobs with
 * almost no leadership titles, so the connector queries the search endpoint
 * per seniority tag (Director, Executive) instead, paging with nextCursor.
 * Docs: https://himalayas.app/docs/remote-jobs-api. Apply links point at
 * himalayas.app, which serves as the visible source credit their terms ask.
 */
export function himalayasConnector(
  deps: FetchDeps,
  options: { pages: number; queries: string[] }
): { id: "himalayas"; run: () => Promise<RawJob[]> } {
  const seniorities = ["Director", "Executive"];
  // the plain seniority feeds surface only the fresh slice (a handful of
  // jobs), while q= keyword feeds walk the full history; seeds cover the
  // widened function families
  return {
    id: "himalayas",
    async run() {
      const out: RawJob[] = [];
      const seen = new Set<string>();
      for (const query of options.queries) {
       for (const seniority of seniorities) {
        let cursor: string | undefined;
        for (let page = 1; page <= options.pages; page += 1) {
          try {
            const url = new URL("https://himalayas.app/jobs/api/search");
            url.searchParams.set("q", query);
            url.searchParams.set("seniority", seniority);
            url.searchParams.set("limit", "20");
            if (cursor) url.searchParams.set("cursor", cursor);
            const payload = (await deps.fetchJson(url.toString())) as {
              jobs?: HimalayasJob[];
              nextCursor?: string;
            };
            const jobs = payload.jobs ?? [];
            if (jobs.length === 0) break;
            for (const job of jobs) {
              if (!job.guid || !job.title || !job.applicationLink) continue;
              if (seen.has(job.guid)) continue;
              seen.add(job.guid);
              const restrictions = job.locationRestrictions ?? [];
              const period = job.salaryPeriod ? PERIOD_MAP[job.salaryPeriod] : undefined;
              const published = job.pubDate ? new Date(job.pubDate * 1000) : null;
              out.push({
                source: "himalayas",
                externalId: `hml-${job.guid.slice(0, 8)}`,
                title: job.title,
                company: job.companyName?.trim() || "Unknown company",
                companyLogoUrl: job.companyLogo,
                applyUrl: job.applicationLink,
                sourceUrl: job.applicationLink,
                descriptionHtml: job.description ?? "",
                locationRaw: restrictions.length > 0 ? `Remote, ${restrictions.join(", ")}` : "Remote",
                remoteHint: true,
                employmentHint: job.employmentType ?? null,
                salaryHint:
                  job.minSalary && job.maxSalary && job.currency && period
                    ? { min: job.minSalary, max: job.maxSalary, currency: job.currency, period }
                    : null,
                postedAt:
                  published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
              });
            }
            if (!payload.nextCursor) break;
            cursor = payload.nextCursor;
          } catch (error) {
            console.warn(`[himalayas] ${query}/${seniority} page ${page} failed: ${(error as Error).message}`);
            break;
          }
        }
       }
      }
      return out;
    },
  };
}
