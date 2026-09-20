export interface ExperienceRange {
  min: number;
  max?: number;
}

const MIN_YEARS = 1;
const MAX_YEARS = 30;

// Range before plus before bare only breaks ties at the same start index;
// across the text the earliest mention wins, so a later sub-qualifier
// ("8+ years ... including 2-3 years on X") cannot beat the real minimum.
const STRATEGIES: Array<{ priority: number; pattern: RegExp; build: (m: RegExpExecArray) => ExperienceRange }> = [
  { priority: 0, pattern: /(\d{1,2})\s*(?:[-\u2010-\u2015]|to)\s*(\d{1,2})\s*(?:years?|yrs?\.?)\b/gi, build: (m) => ({ min: Number(m[1]), max: Number(m[2]) }) },
  { priority: 1, pattern: /(\d{1,2})\s*\+\s*(?:years?|yrs?\.?)\b/gi, build: (m) => ({ min: Number(m[1]) }) },
  { priority: 2, pattern: /(\d{1,2})\s*(?:years?|yrs?\.?)\b/gi, build: (m) => ({ min: Number(m[1]) }) },
];

function plausible(min: number, max?: number): boolean {
  if (min < MIN_YEARS || min > MAX_YEARS) return false;
  if (max !== undefined && (max < min || max > MAX_YEARS)) return false;
  return true;
}

function sentenceAround(text: string, start: number, end: number): string {
  const from = Math.max(
    text.lastIndexOf(".", start),
    text.lastIndexOf(";", start),
    text.lastIndexOf("\n", start)
  );
  const toCandidates = [text.indexOf(".", end), text.indexOf(";", end), text.indexOf("\n", end)]
    .filter((i) => i !== -1);
  const to = toCandidates.length > 0 ? Math.min(...toCandidates) : text.length;
  return text.slice(from + 1, to);
}

function firstCandidate(
  text: string,
  contextCheck: (sentence: string) => boolean
): { index: number; priority: number; range: ExperienceRange } | undefined {
  let best: { index: number; priority: number; range: ExperienceRange } | undefined;
  for (const { priority, pattern, build } of STRATEGIES) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const range = build(match);
      if (!plausible(range.min, range.max)) continue;
      if (!contextCheck(sentenceAround(text, match.index, match.index + match[0].length))) continue;
      if (
        !best ||
        match.index < best.index ||
        (match.index === best.index && priority < best.priority)
      ) {
        best = { index: match.index, priority, range };
      }
      break; // only the first plausible candidate of each strategy competes
    }
  }
  return best;
}

/**
 * Extracts the years-of-experience requirement from posting text. In the body
 * a count is only trusted when the word "experience" sits in the same
 * sentence, so tenure statements ("founded 3 years ago") and sub-qualifier
 * mentions next to an unrelated sentence do not register. Requirement bullet
 * lines get a relaxed rule: an explicit count there is requirement intent
 * even without the word. The earliest plausible mention wins.
 */
export function extractExperience(text: string, requirementText = ""): ExperienceRange | undefined {
  const inBody = firstCandidate(text, (sentence) => /experience/i.test(sentence));
  if (inBody) return inBody.range;
  const inRequirements = firstCandidate(requirementText, () => true);
  return inRequirements?.range;
}
