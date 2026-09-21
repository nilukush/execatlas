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

// their period vocabulary is lowercase (annual, monthly, hourly, ...);
// hourly, weekly and fortnightly are skipped rather than annualized into a
// misleading band
const PERIOD_MAP: Record<string, "annual" | "monthly"> = {
  annual: "annual",
  monthly: "monthly",
};

/**
 * Himalayas free remote-jobs API, no key. The firehose holds 100k+ jobs with
 * almost no leadership titles, so the connector queries the search endpoint
 * with keyword feeds crossed with the Director and Executive seniority tags.
 * The search endpoint pages with the page parameter (nextCursor exists only
 * on the browse endpoint) and reports offset and totalCount for exhaustion.
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
        for (let page = 1; page <= options.pages; page += 1) {
          try {
            const url = new URL("https://himalayas.app/jobs/api/search");
            url.searchParams.set("q", query);
            url.searchParams.set("seniority", seniority);
            url.searchParams.set("page", String(page));
            const payload = (await deps.fetchJson(url.toString())) as {
              jobs?: HimalayasJob[];
              offset?: number;
              totalCount?: number;
            };
            const jobs = payload.jobs ?? [];
            if (jobs.length === 0) break;
            const offset = payload.offset ?? 0;
            const total = payload.totalCount ?? Number.MAX_SAFE_INTEGER;
            if (offset + jobs.length >= total) break;
            for (const job of jobs) {
              if (!job.guid || !job.title || !job.applicationLink) continue;
              if (seen.has(job.guid)) continue;
              seen.add(job.guid);
              const restrictions = job.locationRestrictions ?? [];
              const period = job.salaryPeriod ? PERIOD_MAP[job.salaryPeriod] : undefined;
              const published = job.pubDate ? new Date(job.pubDate * 1000) : null;
              out.push({
                source: "himalayas",
                externalId: `hml-${job.guid.split("/").pop() ?? job.guid}`,
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
