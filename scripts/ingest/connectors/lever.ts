import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface LeverPosting {
  id: string;
  text: string;
  categories?: { location?: string; commitment?: string };
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  description?: string;
}

/** Lever boards have no company field; the board token is the identity. */
function companyFromToken(token: string): string {
  const base = token.split(".")[0].replace(/[-_]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Lever public postings API, one request per company board. The endpoint
 * answers with either a bare array or a { hits } envelope, so both shapes
 * are accepted. Docs: https://github.com/lever/postings-api
 */
export function leverConnector(
  deps: FetchDeps,
  options: { tokens: string[]; names?: Record<string, string> }
): { id: "lever"; run: () => Promise<RawJob[]> } {
  return {
    id: "lever",
    async run() {
      const out: RawJob[] = [];
      for (const token of options.tokens) {
        try {
          const payload = (await deps.fetchJson(
            `https://api.lever.co/v0/postings/${token}?mode=json`
          )) as LeverPosting[] | { hits?: LeverPosting[] };
          const postings = Array.isArray(payload) ? payload : (payload.hits ?? []);
          for (const job of postings) {
            if (!job.text || !job.id) continue;
            const apply = job.applyUrl ?? job.hostedUrl;
            if (!apply) continue;
            const location = job.categories?.location ?? "";
            out.push({
              source: "lever",
              externalId: `lv-${job.id.slice(0, 8)}`,
              title: job.text,
              company: options.names?.[token] ?? companyFromToken(token),
              applyUrl: apply,
              sourceUrl: job.hostedUrl ?? apply,
              descriptionHtml: job.description ?? "",
              locationRaw: location,
              remoteHint: job.workplaceType === "remote" || /remote/i.test(location),
              employmentHint: job.categories?.commitment ?? null,
              postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
            });
          }
        } catch (error) {
          console.warn(`[lever] board "${token}" failed: ${(error as Error).message}`);
        }
      }
      return out;
    },
  };
}
