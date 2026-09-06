import type { WorkMode } from "../types";

export interface WorkModeResult {
  mode: WorkMode;
  officeDays?: number;
}

// Ordered attempts: each captures the number of office days per week.
// Up to three lowercase words may sit between the preposition and "office",
// so "in our Dubai office" works alongside "in the office".
const DAY_PATTERNS: RegExp[] = [
  /(\d)\s*(?:days?|d)\s*(?:a|per|\/)\s*(?:week|wk)\w*\s*(?:in|at|from)\s*(?:[a-z]+\s+){0,3}?(?:office|onsite|on-?site|hq)/i,
  /(?:in|at|from)\s*(?:the\s*)?(?:office|onsite|on-?site|hq)\s*[^.\n]{0,15}?(\d)\s*days?/i,
  /(\d)\s*days?\s*(?:a\s*week\s*)?(?:in|at|from)\s*(?:[a-z]+\s+){0,3}?(?:office|onsite|on-?site|hq)/i,
];

const ONSITE = /\bon-?site\b|\bin[- ]office\b|\bwork\s+from\s+office\b|\boffice[- ]based\b|\bfully\s+onsite\b/i;
const REMOTE = /\bremote\b|\bwork\s+from\s+home\b|\bwfh\b|\bdistributed\b|\banywhere\s+in\s+the\s+world\b/i;

/**
 * Detects the commute type from posting text. Explicit day counts mean a
 * hybrid arrangement regardless of wording order; otherwise hybrid wording,
 * then on-site wording, then remote wording, then a source hint.
 */
export function detectWorkMode(text: string, remoteHint = false): WorkModeResult {
  for (const pattern of DAY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const days = Number(match[1]);
      if (days >= 1 && days <= 5) {
        return { mode: "hybrid", officeDays: days };
      }
      // day count outside the one-to-five range is noise; fall through
      break;
    }
  }

  if (/\bhybrid\b/i.test(text)) return { mode: "hybrid" };
  if (ONSITE.test(text)) return { mode: "onsite" };
  if (REMOTE.test(text)) return { mode: "remote" };
  if (remoteHint) return { mode: "remote" };
  return { mode: "unspecified" };
}
