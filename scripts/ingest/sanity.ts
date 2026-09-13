import type { DatasetStats } from "../../src/lib/types";

export interface SanityProblem {
  rule: "empty" | "total-floor" | "source-floor" | "minimum";
  detail: string;
}

/** Sources below this previous count are not floor-checked; tiny boards dry up legitimately. */
const SMALL_SOURCE = 5;

function countBySource(jobs: Array<{ source?: string }>): Record<string, number> {
  const bySource: Record<string, number> = {};
  for (const job of jobs) {
    if (job?.source) bySource[job.source] = (bySource[job.source] ?? 0) + 1;
  }
  return bySource;
}

/**
 * Guards the nightly publish: a collapsed dataset (blocked source IPs, changed
 * API shapes, rate limits) must abort the run instead of shipping to the site.
 */
export function datasetProblems(
  jobs: Array<{ source?: string }> | null | undefined,
  prev?: DatasetStats | null
): SanityProblem[] {
  const problems: SanityProblem[] = [];
  if (!jobs || jobs.length === 0) {
    return [{ rule: "empty", detail: "dataset is empty" }];
  }
  if (prev) {
    const floor = Math.ceil(prev.total / 2);
    if (jobs.length < floor) {
      problems.push({
        rule: "total-floor",
        detail: `${jobs.length} jobs is under half the previous ${prev.total}`,
      });
    }
    const bySource = countBySource(jobs);
    for (const [source, previousCount] of Object.entries(prev.bySource)) {
      if (previousCount < SMALL_SOURCE) continue;
      const current = bySource[source] ?? 0;
      if (current < Math.ceil(previousCount / 2)) {
        problems.push({
          rule: "source-floor",
          detail: `${source}: ${current} jobs is under half the previous ${previousCount}`,
        });
      }
    }
  } else if (jobs.length < 20) {
    problems.push({ rule: "minimum", detail: `only ${jobs.length} jobs with no previous run to compare` });
  }
  return problems;
}

/**
 * The gate protects the nightly publish only. Smoke and --only runs are
 * connectivity checks whose tiny results would always trip the floors, and
 * --force is the human override.
 */
export function shouldRunSanityGate(opts: { smoke: boolean; only: boolean; force: boolean }): boolean {
  return !opts.smoke && !opts.only && !opts.force;
}
