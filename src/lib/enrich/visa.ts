import type { VisaSignal } from "../types";

const POSITIVE: RegExp[] = [
  /\bvisa sponsor(ship|ed|ing)?\b/i,
  /\bsponsor(?:ing)?\s+(?:work\s+)?visas?\b/i,
  /\bwe sponsor\b/i,
  /\bsponsorship\s+(?:is\s+|are\s+|will\s+be\s+)?(?:available|offered|provided)\b/i,
  /\bwork\s+permit\s+sponsor(ship)?\b/i,
  /\brelocation\s+(?:support|assistance|package|benefits?)\b/i,
  /\bwill\s+(?:be\s+)?sponsor(?:ed)?\b/i,
  /\bemployment\s+visa\b/i,
  /\bassist(?:ance)?\s+with\s+(?:visa|relocation|work\s+permits?)\b/i,
  /\bprovides?\s+visa\b/i,
];

const NEGATIVE: RegExp[] = [
  /\bno\s+visa\s+sponsor(ship)?\b/i,
  /\bnot\s+able\s+to\s+sponsor\b/i,
  /\bunable\s+to\s+(?:offer|provide|sponsor)\b/i,
  /\bcannot\s+sponsor\b/i,
  /\bdoes(?:n't|\s+not)\s+(?:offer|provide)\s+(?:visa\s+)?sponsorship\b/i,
  /\bmust\s+(?:already\s+)?(?:have|hold|possess)\b[^.]{0,50}?\b(?:right\s+to\s+work|work\s+authorization|authorization\s+to\s+work|(?:own\s+)?work\s+permits?)\b/i,
  /\b(?:right\s+to\s+work|work\s+permit)\s+(?:is\s+)?(?:already\s+)?required\b/i,
  /\bwithout\s+sponsorship\b/i,
  /\bno\s+sponsorship\b/i,
  /\bnot\s+eligible\s+for\s+(?:visa\s+)?sponsorship\b/i,
  /\b(?:hold|holds|holding)\s+(?:their\s+)?own\s+(?:right\s+to\s+work|work\s+permit)\b/i,
];

/**
 * Reads posting text for visa sponsorship language. Explicit refusals win
 * over generic sponsorship mentions; silence stays unknown.
 */
export function detectVisa(text: string): VisaSignal {
  if (!text) return "unknown";
  if (NEGATIVE.some((re) => re.test(text))) return "no";
  if (POSITIVE.some((re) => re.test(text))) return "yes";
  return "unknown";
}
