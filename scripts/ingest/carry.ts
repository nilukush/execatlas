import { dedupeKey } from "./dedupe";
import type { FeedFailure } from "./http";
import type { Job } from "../../src/lib/types";

// a role outlives its failed feed for three nights at most (issues 46, 47, 59)
export const MAX_CARRIED_NIGHTS = 3;
// and an answering feed that no longer lists it for two nights (issue 32)
const MAX_ABSENT_NIGHTS = 2;
// a role posted this many whole days ago is the oldest the site keeps (issue 62)
const MAX_POSTED_AGE_DAYS = 365;
// the unit of a transient failure that concerns a whole source, not one of its feeds (ruling R59)
export const SOURCE_UNIT = "source";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when a role was posted more than 365 whole days before `now`.
 * normalizeJob drops a raw role on it, and carryOver a stored one.
 */
export function postedTooLongAgo(postedAt: string, now: string): boolean {
  return Math.floor((Date.parse(now) - Date.parse(postedAt)) / DAY_MS) > MAX_POSTED_AGE_DAYS;
}

/**
 * The record as it was, with the given night counter set and the last-seen
 * stamp kept: its own value, else the stamp of the previous dataset.
 */
function keep(
  previous: Job,
  nights: Partial<Pick<Job, "carriedNights" | "absentNights">>,
  previousGeneratedAt?: string
): Job {
  const lastSeenAt = previous.lastSeenAt ?? previousGeneratedAt;
  return lastSeenAt === undefined ? { ...previous, ...nights } : { ...previous, ...nights, lastSeenAt };
}

/**
 * Judges every previous record that tonight's fresh list does not hold, in
 * six rules: present tonight, posted more than a year ago, expired before
 * tonight, its feed failed tonight, its feed is gone for good, or its feed
 * answered without it. The result holds the kept records only, each as it
 * was: a carried one when its feed failed, a grace one when its feed
 * answered and no longer lists it.
 */
export function carryOver(input: {
  previous: Job[];
  previousGeneratedAt?: string;
  fresh: Job[];
  failures: FeedFailure[];
  now: string;
}): { jobs: Job[]; carriedBySource: Record<string, number>; graceCount: number } {
  const freshIds = new Set(input.fresh.map((job) => job.id));
  const freshKeys = new Set(input.fresh.map(dedupeKey));
  const failuresBySource = new Map<string, FeedFailure[]>();
  for (const failure of input.failures) {
    const reported = failuresBySource.get(failure.source);
    if (reported) reported.push(failure);
    else failuresBySource.set(failure.source, [failure]);
  }

  const jobs: Job[] = [];
  const carriedBySource: Record<string, number> = {};
  let graceCount = 0;
  for (const previous of input.previous) {
    // 1. present tonight, by id or by company, title and place: the fresh record wins
    if (freshIds.has(previous.id) || freshKeys.has(dedupeKey(previous))) continue;
    // 2. posted more than a year ago
    if (postedTooLongAgo(previous.postedAt, input.now)) continue;
    // 3. expired before tonight: neither carried nor kept in grace (ruling R58)
    if (previous.expiresAt !== undefined && Date.parse(previous.expiresAt) < Date.parse(input.now)) continue;
    // a record from before feeds were tagged has no feed of its own
    const untagged = previous.feedUnit === undefined;
    const reported = failuresBySource.get(previous.source) ?? [];
    const own = untagged ? [] : reported.filter((failure) => failure.unit === previous.feedUnit);
    // 4. its feed failed tonight, or its source as a whole (ruling R59); any
    // feed of its source when it names none
    const failedTonight =
      own.some((failure) => failure.transient) ||
      reported.some((failure) => failure.transient && (untagged || failure.unit === SOURCE_UNIT));
    if (failedTonight) {
      const carriedNights = (previous.carriedNights ?? 0) + 1;
      if (carriedNights <= MAX_CARRIED_NIGHTS) {
        jobs.push(keep(previous, { carriedNights }, input.previousGeneratedAt));
        carriedBySource[previous.source] = (carriedBySource[previous.source] ?? 0) + 1;
      }
      continue;
    }
    // 5. its feed is gone for good
    if (own.length > 0) continue;
    // 6. its feed answered and no longer lists it
    const absentNights = (previous.absentNights ?? 0) + 1;
    if (absentNights <= MAX_ABSENT_NIGHTS) {
      jobs.push(keep(previous, { absentNights }, input.previousGeneratedAt));
      graceCount += 1;
    }
  }
  return { jobs, carriedBySource, graceCount };
}
