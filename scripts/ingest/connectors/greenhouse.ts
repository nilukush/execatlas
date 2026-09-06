import type { RawJob } from "../../../src/lib/types";
import type { FetchDeps } from "../http";

interface GreenhouseBoardJob {
  id: number;
  title: string;
  company_name?: string;
  absolute_url: string;
  content?: string;
  location?: { name?: string };
  first_published?: string;
  updated_at?: string;
}

/**
 * Greenhouse public Job Board API: one request per company board with
 * content=true, then title and location filtering happens downstream.
 * Docs: https://docs.greenhouse.io/job-board.html
 */
export function greenhouseConnector(
  deps: FetchDeps,
  options: { tokens: string[] }
): { id: "greenhouse"; run: () => Promise<RawJob[]> } {
  return {
    id: "greenhouse",
    async run() {
      const out: RawJob[] = [];
      for (const token of options.tokens) {
        try {
          const board = (await deps.fetchJson(
            `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`
          )) as { jobs?: GreenhouseBoardJob[] };
          for (const job of board.jobs ?? []) {
            if (!job.title || !job.absolute_url) continue;
            out.push({
              source: "greenhouse",
              externalId: `gh-${job.id}`,
              title: job.title,
              company: job.company_name?.trim() || token,
              applyUrl: job.absolute_url,
              sourceUrl: job.absolute_url,
              descriptionHtml: job.content ?? "",
              locationRaw: job.location?.name ?? "",
              postedAt: job.first_published ?? job.updated_at ?? null,
            });
          }
        } catch (error) {
          console.warn(`[greenhouse] board "${token}" failed: ${(error as Error).message}`);
        }
      }
      return out;
    },
  };
}
