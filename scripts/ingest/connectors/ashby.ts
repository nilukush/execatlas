import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean | null;
  workplaceType?: string;
  employmentType?: string;
  descriptionHtml?: string;
  applyUrl?: string;
  jobUrl?: string;
  publishedAt?: string;
}

// Ashby reports camelCase compounds ("FullTime"); our role-type detector
// reads the hyphenated forms every other source uses
const EMPLOYMENT_MAP: Record<string, string> = {
  FullTime: "Full-time",
  PartTime: "Part-time",
  Temporary: "Temporary",
  Internship: "Internship",
  Contract: "Contract",
};

/** Ashby boards have no company field; the board token is the identity. */
function companyFromToken(token: string): string {
  const base = token.split(".")[0].replace(/[-_]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Ashby public posting API, one request per company board, no key.
 * Docs: https://developers.ashbyhq.com
 */
export function ashbyConnector(
  deps: FetchDeps,
  options: { tokens: string[]; names?: Record<string, string> }
): { id: "ashby"; run: () => Promise<RawJob[]> } {
  return {
    id: "ashby",
    async run() {
      const out: RawJob[] = [];
      for (const token of options.tokens) {
        try {
          const payload = (await deps.fetchJson(
            `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`
          )) as { jobs?: AshbyJob[] };
          for (const job of payload.jobs ?? []) {
            if (!job.title || !job.id) continue;
            const apply = job.applyUrl ?? job.jobUrl;
            if (!apply) continue;
            const location = job.location ?? "";
            out.push({
              source: "ashby",
              externalId: `as-${job.id.slice(0, 8)}`,
              title: job.title,
              company: options.names?.[token] ?? companyFromToken(token),
              applyUrl: apply,
              sourceUrl: job.jobUrl ?? apply,
              descriptionHtml: job.descriptionHtml ?? "",
              locationRaw: location,
              remoteHint:
                job.isRemote === true || job.workplaceType?.toLowerCase() === "remote" || /remote/i.test(location),
              employmentHint: job.employmentType ? (EMPLOYMENT_MAP[job.employmentType] ?? job.employmentType) : null,
              postedAt: (() => { const d = job.publishedAt ? new Date(job.publishedAt) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; })(),
            });
          }
        } catch (error) {
          console.warn(`[ashby] board "${token}" failed: ${(error as Error).message}`);
        }
      }
      return out;
    },
  };
}
