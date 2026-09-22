import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface AdzunaJob {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  redirect_url?: string;
  created?: string;
  contract_time?: string | null;
  contract_type?: string | null;
  description?: string;
}

// the connector knows the country from the queried endpoint, so the English
// name is prefixed to the location: Adzuna's area[0] is the local-language
// country ("Deutschland") and city strings often miss our aliases
const ADZUNA_COUNTRY_NAMES: Record<string, string> = {
  gb: "United Kingdom",
  de: "Germany",
  fr: "France",
  nl: "Netherlands",
  es: "Spain",
  it: "Italy",
  pl: "Poland",
  in: "India",
  sg: "Singapore",
  br: "Brazil",
  mx: "Mexico",
  us: "United States",
  ca: "Canada",
};

const CONTRACT_TIME: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
};

/**
 * Adzuna search API with the free Trial Access key. One page per country and
 * query, 50 results; classifyTitle filters locally. Salaries from Adzuna are
 * their own predictions (salary_is_predicted), so no salary hint is passed
 * and our benchmark estimate fills instead. Apply URLs are Adzuna redirect
 * links, which is how their partner program expects attribution.
 * Docs: https://developer.adzuna.com/docs/search
 */
export function adzunaConnector(
  deps: FetchDeps,
  options: { appId: string; appKey: string; countries: string[]; queries: string[]; pages: number }
): { id: "adzuna"; run: () => Promise<RawJob[]> } {
  return {
    id: "adzuna",
    async run() {
      if (!options.appId || !options.appKey) {
        console.warn("[adzuna] no credentials (ADZUNA_APP_ID / ADZUNA_APP_KEY); skipping source");
        return [];
      }
      const out: RawJob[] = [];
      for (const country of options.countries) {
        const countryName = ADZUNA_COUNTRY_NAMES[country];
        if (!countryName) continue;
        for (const query of options.queries) {
          for (let page = 1; page <= options.pages; page += 1) {
            try {
              const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
              url.searchParams.set("app_id", options.appId);
              url.searchParams.set("app_key", options.appKey);
              url.searchParams.set("results_per_page", "50");
              url.searchParams.set("what", query);
              url.searchParams.set("content-type", "application/json");
              const payload = (await deps.fetchJson(url.toString())) as { results?: AdzunaJob[] };
              const jobs = payload.results ?? [];
              if (jobs.length === 0) break;
              for (const job of jobs) {
                if (!job.title || !job.id || !job.redirect_url) continue;
                const area = job.location?.area?.join(", ") ?? "";
                const employment = [
                  job.contract_time ? CONTRACT_TIME[job.contract_time] ?? job.contract_time : null,
                  job.contract_type,
                ]
                  .filter(Boolean)
                  .join(", ");
                const created = job.created ? new Date(job.created) : null;
                out.push({
                  source: "adzuna",
                  externalId: `ad-${job.id}`,
                  title: job.title,
                  company: job.company?.display_name?.trim() || "Unknown company",
                  applyUrl: job.redirect_url,
                  sourceUrl: job.redirect_url,
                  descriptionHtml: job.description ?? "",
                  locationRaw: area ? `${countryName}, ${area}` : countryName,
                  remoteHint: /remote|anywhere/i.test(job.location?.display_name ?? "") || /remote/i.test(job.title),
                  employmentHint: employment || null,
                  // Adzuna salaries are their own predictions, not employer
                  // statements; deliberately no hint so our benchmark fills
                  salaryHint: null,
                  postedAt:
                    created && !Number.isNaN(created.getTime()) ? created.toISOString() : null,
                });
              }
            } catch (error) {
              console.warn(`[adzuna] ${country}/${query} page ${page} failed: ${(error as Error).message}`);
              break;
            }
          }
        }
      }
      return out;
    },
  };
}
