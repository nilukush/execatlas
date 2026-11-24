import type { FeedFailure } from "./http";
import type { Job } from "../../src/lib/types";

// a role outlives its failed feed for three nights at most (issues 46, 47, 59)
const MAX_CARRIED_NIGHTS = 3;

/**
 * Keeps the previous records of the feeds that failed tonight. A feed that
 * answered and no longer lists a role, or failed for good, drops it. The
 * result holds the carried records only: each is stored as it was, with the
 * night count and the last-seen stamp updated.
 */
export function carryOver(input: {
  previous: Job[];
  previousGeneratedAt?: string;
  fresh: Job[];
  failures: FeedFailure[];
}): { jobs: Job[]; carriedBySource: Record<string, number> } {
  const freshIds = new Set(input.fresh.map((job) => job.id));
  const failedUnits = new Map<string, Set<string>>();
  for (const failure of input.failures) {
    if (!failure.transient) continue;
    const units = failedUnits.get(failure.source);
    if (units) units.add(failure.unit);
    else failedUnits.set(failure.source, new Set([failure.unit]));
  }

  const jobs: Job[] = [];
  const carriedBySource: Record<string, number> = {};
  for (const previous of input.previous) {
    if (freshIds.has(previous.id)) continue;
    // a record from before feeds were tagged belongs to its source as a whole
    const failed =
      previous.feedUnit === undefined
        ? failedUnits.has(previous.source)
        : failedUnits.get(previous.source)?.has(previous.feedUnit) === true;
    if (!failed) continue;
    const carriedNights = (previous.carriedNights ?? 0) + 1;
    if (carriedNights > MAX_CARRIED_NIGHTS) continue;
    const lastSeenAt = previous.lastSeenAt ?? input.previousGeneratedAt;
    jobs.push(lastSeenAt === undefined ? { ...previous, carriedNights } : { ...previous, carriedNights, lastSeenAt });
    carriedBySource[previous.source] = (carriedBySource[previous.source] ?? 0) + 1;
  }
  return { jobs, carriedBySource };
}
