import type { RoleType } from "../types";

/** Priority order: the more specific duration types win over generic ones. */
const TEXT_PATTERNS: Array<[RoleType, RegExp]> = [
  ["part-time", /\bpart[- ]time\b/i],
  ["temporary", /\btemp(?:orary)?\b/i],
  ["freelance", /\bfreelance\b|\bcontractor\b/i],
  ["contract", /\bcontract\b/i],
  ["interim", /\binterim\b/i],
  ["permanent", /\bpermanent\b/i],
  ["full-time", /\bfull[- ]time\b/i],
];

const HINT_MAP: Array<[RoleType, RegExp]> = [
  ["part-time", /part/i],
  ["temporary", /temp/i],
  ["freelance", /freelance|contractor/i],
  ["contract", /contract/i],
  ["interim", /interim/i],
  ["permanent", /permanent/i],
  ["full-time", /full/i],
];

/**
 * Detects the employment type. A structured hint from the source (when the
 * API provides an employmentType field) wins over free-text scanning.
 */
export function detectRoleType(text: string, hint?: string | null): RoleType | null {
  if (hint) {
    for (const [type, re] of HINT_MAP) {
      if (re.test(hint)) return type;
    }
  }
  for (const [type, re] of TEXT_PATTERNS) {
    if (re.test(text)) return type;
  }
  return null;
}
