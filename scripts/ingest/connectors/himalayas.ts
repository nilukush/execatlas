import type { RawJob } from "../../../src/lib/types";
import { reportFeedFailure } from "../http";
import type { FetchDeps } from "../http";

interface HimalayasJob {
  guid: string;
  title: string;
  companyName: string;
  companyLogo?: string;
  applicationLink: string;
  locationRestrictions?: string[];
  pubDate?: number;
  expiryDate?: number | null;
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

// their dates are Unix timestamps in seconds; an empty or broken one gives no stamp
function stampOf(seconds: number | null | undefined): string | null {
  const date = seconds ? new Date(seconds * 1000) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/**
 * Himalayas free remote-jobs API, no key. The firehose holds 100k+ jobs with
 * almost no leadership titles, so the connector queries the search endpoint
 * with keyword feeds crossed with the Director and Executive seniority tags.
 * The search endpoint pages with the page parameter (nextCursor exists only
 * on the browse endpoint) and reports offset and totalCount for exhaustion.
 * Docs: https://himalayas.app/docs/remote-jobs-api. Apply links point at
 * himalayas.app, which serves as the visible source credit their terms ask.
 * A job whose expiryDate lies before the run time has expired and is skipped.
 */
export function himalayasConnector(
  deps: FetchDeps,
  options: { pages: number; queries: string[]; now: string }
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
      // an expiry is judged by the times, not by the order of two ISO strings
      const runTime = Date.parse(options.now);
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
              const expiresAt = stampOf(job.expiryDate);
              // the feed still returns a role after its expiry: it is not listed tonight
              if (expiresAt !== null && Date.parse(expiresAt) < runTime) continue;
              if (seen.has(job.guid)) continue;
              seen.add(job.guid);
              const restrictions = job.locationRestrictions ?? [];
              const period = job.salaryPeriod ? PERIOD_MAP[job.salaryPeriod] : undefined;
              out.push({
                source: "himalayas",
                feedUnit: `${query}/${seniority}`,
                externalId: `hml-${job.guid.split("/").pop() ?? job.guid}`,
                title: job.title,
                company: job.companyName?.trim() || "Unknown company",
                companyLogoUrl: job.companyLogo,
                applyUrl: job.applicationLink,
                sourceUrl: job.applicationLink,
                descriptionHtml: job.description ?? "",
                locationRaw: restrictions.length > 0 ? `Remote, ${restrictions.join(", ")}` : "Remote",
                locationRestrictions: restrictions,
                remoteHint: true,
                employmentHint: job.employmentType ?? null,
                salaryHint:
                  job.minSalary && job.maxSalary && job.currency && period
                    ? { min: job.minSalary, max: job.maxSalary, currency: job.currency, period }
                    : null,
                postedAt: stampOf(job.pubDate),
                ...(expiresAt ? { expiresAt } : {}),
              });
            }
          } catch (error) {
            const failure = reportFeedFailure(deps, error, "himalayas", `${query}/${seniority}`);
            console.warn(`[himalayas] ${query}/${seniority} page ${page} failed: ${failure.message}`);
            break;
          }
        }
       }
      }
      return out;
    },
  };
}
