import { dedupeKey } from "./dedupe";
import { countryByIso2 } from "../../src/lib/locations";
import { estimateSalary, isPlausibleBand } from "../../src/lib/salary";
import type { FeedFailure } from "./http";
import type { Job } from "../../src/lib/types";

// a role outlives its failed feed for three nights at most (issues 46, 47, 59)
export const MAX_CARRIED_NIGHTS = 3;
// and an answering feed that no longer lists it for two nights (issue 32)
const MAX_ABSENT_NIGHTS = 2;
// a role posted this many whole days ago is the oldest the site keeps (issue 62)
const MAX_POSTED_AGE_DAYS = 365;
// the unit of a transient failure that concerns a whole source, not one of its feeds (ruling R59);
// it is a sentinel inside the namespace of the feed units: no configured unit may be named "source"
export const SOURCE_UNIT = "source";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when a role was posted more than 365 whole days before `nowMs`, the
 * run time in milliseconds. normalizeJob drops a raw role on it, and
 * carryOver a stored one.
 */
export function postedTooLongAgo(postedAt: string, nowMs: number): boolean {
  return Math.floor((nowMs - Date.parse(postedAt)) / DAY_MS) > MAX_POSTED_AGE_DAYS;
}

/**
 * A kept record passes the pay check a fresh one passes (ruling R63). A
 * stated band that cannot be pay gives way to the estimate for its country
 * and domain, or to no band where no benchmark covers the country. A
 * plausible stated band and an estimate stay as they were stored.
 */
function checkedPay(previous: Job): Job {
  const salary = previous.salary;
  if (!salary || salary.source !== "stated" || isPlausibleBand(salary)) return previous;
  const iso2 = previous.location.countryIso2;
  const iso3 = iso2 === undefined ? undefined : countryByIso2(iso2)?.iso3;
  return { ...previous, salary: iso3 === undefined ? null : estimateSalary(iso3, previous.domain) };
}

/**
 * The record as it was, with the given night counter set, the last-seen
 * stamp kept (its own value, else the stamp of the previous dataset) and its
 * stated band judged by the pay check.
 */
function keep(
  previous: Job,
  nights: Partial<Pick<Job, "carriedNights" | "absentNights">>,
  previousGeneratedAt?: string
): Job {
  const kept = checkedPay(previous);
  const lastSeenAt = previous.lastSeenAt ?? previousGeneratedAt;
  return lastSeenAt === undefined ? { ...kept, ...nights } : { ...kept, ...nights, lastSeenAt };
}

/**
 * Judges every previous record that tonight's fresh list does not hold, in
 * six rules: present tonight, posted more than a year ago, expired before
 * tonight, its feed failed tonight, its feed is gone for good, or its feed
 * answered without it. The result holds the kept records only, each as it
 * was apart from the night counter, the last-seen stamp and the pay check: a
 * carried one when its feed failed, a grace one when its feed answered and
 * no longer lists it.
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
  // the run time is parsed once: every rule below reads times, never the spelling of a stamp
  const now = Date.parse(input.now);

  const jobs: Job[] = [];
  const carriedBySource: Record<string, number> = {};
  let graceCount = 0;
  for (const previous of input.previous) {
    // 1. present tonight, by id or by company, title and place: the fresh record wins
    if (freshIds.has(previous.id) || freshKeys.has(dedupeKey(previous))) continue;
    // 2. posted more than a year ago
    if (postedTooLongAgo(previous.postedAt, now)) continue;
    // 3. expired before tonight: neither carried nor kept in grace (ruling R58)
    if (previous.expiresAt !== undefined && Date.parse(previous.expiresAt) < now) continue;
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
