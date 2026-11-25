import type { SourceId } from "./types";

export type ApplyDestination = SourceId | "employer";

/** The site the Adzuna terms name. It stands in when a dataset predates sourceHome. */
export const ADZUNA_HOME = "https://www.adzuna.co.uk";

// a board and the host family that serves its pages. The family is the host without a leading www
const BOARD_FAMILIES: ReadonlyArray<readonly [family: RegExp, board: SourceId]> = [
  [/^adzuna\.[a-z]+(?:\.[a-z]+)?$/, "adzuna"],
  [/^arbeitnow\.[a-z]+(?:\.[a-z]+)?$/, "arbeitnow"],
  [/^himalayas\.app$/, "himalayas"],
  [/^jobicy\.com$/, "jobicy"],
];

/** The host of a link, or null when the link has none. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Where an apply link opens: a job board, or the employer's own site. */
export function applyDestination(applyUrl: string): ApplyDestination {
  const host = hostOf(applyUrl);
  if (host === null) return "employer";
  const family = host.replace(/^www\./, "");
  return BOARD_FAMILIES.find(([pattern]) => pattern.test(family))?.[1] ?? "employer";
}

/** The Adzuna site an apply link lives on, or null when the link is not on Adzuna. */
export function adzunaHomeUrl(applyUrl: string): string | null {
  return applyDestination(applyUrl) === "adzuna" ? `https://${new URL(applyUrl).hostname}` : null;
}

/**
 * Where the attribution mark links: the site the source names, else the site
 * the apply link lives on, else the site the Adzuna terms name. An index
 * entry carries no apply link, so its mark goes straight to the last.
 */
export function adzunaMarkHref(job: { sourceHome?: string; applyUrl?: string }): string {
  return job.sourceHome ?? (job.applyUrl ? adzunaHomeUrl(job.applyUrl) : null) ?? ADZUNA_HOME;
}
