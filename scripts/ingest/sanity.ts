import type { DatasetStats } from "../../src/lib/types";

export interface SanityProblem {
  rule: "empty" | "total-floor" | "source-floor" | "minimum" | "carried-share";
  detail: string;
}

/** Sources at or above this previous count are floor-checked; smaller ones swing and drought naturally. */
const LARGE_SOURCE = 20;

/** Carried roles may fill at most this share of the final dataset. */
const MAX_CARRIED_SHARE_PERCENT = 40;

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
 * The floors read the final counts, carried roles included; a dataset that
 * leans on carried roles for more than 40 percent is a collapse in slow
 * motion and aborts as well. `carriedCount` holds carried roles only: grace
 * roles are not counted.
 */
export function datasetProblems(
  jobs: Array<{ source?: string }> | null | undefined,
  prev?: DatasetStats | null,
  carriedCount = 0
): SanityProblem[] {
  const problems: SanityProblem[] = [];
  if (!jobs || jobs.length === 0) {
    return [{ rule: "empty", detail: "dataset is empty" }];
  }
  // whole numbers on both sides, so exactly the allowed share passes
  if (carriedCount * 100 > jobs.length * MAX_CARRIED_SHARE_PERCENT) {
    problems.push({
      rule: "carried-share",
      detail: `${carriedCount} of ${jobs.length} jobs are carried from the previous refresh, above ${MAX_CARRIED_SHARE_PERCENT} percent`,
    });
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
      // the gate exists to catch dead sources and gutted datasets, not to
      // enforce stability: a large source dropping to nothing or under a
      // quarter means breakage, while small general boards swing and drought
      // naturally (a one-night spike must not lock in as a floor forever,
      // since aborted runs never write a fresher baseline)
      if (previousCount < LARGE_SOURCE) continue;
      const current = bySource[source] ?? 0;
      if (current < Math.ceil(previousCount / 4)) {
        problems.push({
          rule: "source-floor",
          detail:
            current === 0
              ? `${source}: returned nothing after ${previousCount} jobs`
              : `${source}: ${current} jobs is under a quarter of the previous ${previousCount}`,
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
