import type { SourceId } from "./types";

export type ApplyDestination = SourceId | "employer";

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
