import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface WorkableJob {
  id: string;
  title: string;
  description?: string;
  employmentType?: string;
  url: string;
  location?: { city?: string; countryName?: string; region?: string };
  locations?: Array<{ city?: string; countryName?: string; region?: string } | string>;
  created?: string;
  company?: { title?: string; image?: string };
  workplace?: string;
}

/**
 * Workable public job search endpoint (the same one jobs.workable.com's own
 * frontend calls; no auth, not disallowed by robots.txt). Kept polite: one
 * query per role seed per location, results cached, always linking out.
 */
export function workableConnector(
  deps: FetchDeps,
  options: { queries: string[]; locations: string[] }
): { id: "workable"; run: () => Promise<RawJob[]> } {
  return {
    id: "workable",
    async run() {
      const byId = new Map<string, RawJob>();
      for (const query of options.queries) {
        for (const location of options.locations) {
          try {
            const url = `https://jobs.workable.com/api/v1/jobs?query=${encodeURIComponent(
              query
            )}&location=${encodeURIComponent(location)}`;
            const payload = (await deps.fetchJson(url)) as { jobs?: WorkableJob[] };
            for (const job of payload.jobs ?? []) {
              if (!job.id || !job.title || !job.url) continue;
              if (byId.has(`wk-${job.id}`)) continue;
              byId.set(`wk-${job.id}`, {
                source: "workable",
                externalId: `wk-${job.id}`,
                title: job.title,
                company: job.company?.title?.trim() || "Unknown company",
                companyLogoUrl: job.company?.image || undefined,
                applyUrl: job.url,
                sourceUrl: job.url,
                descriptionHtml: job.description ?? "",
                locationRaw: workableLocation(job),
                remoteHint: job.workplace === "remote",
                employmentHint: job.employmentType || null,
                postedAt: job.created ?? null,
              });
            }
          } catch (error) {
            console.warn(
              `[workable] query "${query}" / "${location}" failed: ${(error as Error).message}`
            );
          }
        }
      }
      return [...byId.values()];
    },
  };
}

function workableLocation(job: WorkableJob): string {
  const loc = job.location ?? (typeof job.locations?.[0] === "object" ? job.locations?.[0] : undefined);
  if (loc && typeof loc === "object") {
    return [loc.city, loc.countryName ?? loc.region].filter(Boolean).join(", ");
  }
  const first = job.locations?.[0];
  if (typeof first === "string") return first;
  return "";
}
