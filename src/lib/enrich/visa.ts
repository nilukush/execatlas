import type { VisaSignal } from "../types";

const POSITIVE: RegExp[] = [
  /\bvisa sponsor(ship|ed|ing)?\b/i,
  /\bsponsor(?:ing)?\s+(?:work\s+)?visas?\b/i,
  /\bwe sponsor\b/i,
  /\bsponsorship\s+(?:is\s+|are\s+|will\s+be\s+)?(?:available|offered|provided)\b/i,
  /\bwork\s+permit\s+sponsor(ship)?\b/i,
  /\bwill\s+(?:be\s+)?sponsor(?:ed)?\b/i,
  /\bemployment\s+visa\b/i,
  /\bassist(?:ance)?\s+with\s+(?:visa|work\s+permits?)\b/i,
  /\bprovides?\s+visa\b/i,
];

const SPONSORSHIP = "(?:visas?|sponsor(?:ship|ing)?|work\\s+permits?)";
const REFUSAL_VERB = "(?:offer|provide|sponsor|support|facilitate)";

/** Up to `max` words, none of which ends a sentence. */
const words = (max: number): string => `(?:(?!\\S*[.!?]\\s)\\S+\\s+){0,${max}}?`;

/** Up to 160 characters inside one sentence. The period of an abbreviation such as U.S. is not a sentence end; letter case cannot tell them apart under the i flag. */
const GAP = "(?:(?<=\\b[A-Za-z])[.!?]|[.!?](?=\\S)|[^.!?]){0,160}?";

/** A negated verb that refuses sponsorship: `negator`, up to `adverbs` words, the verb, the thing refused. */
const refuses = (negator: string, adverbs = 0): RegExp =>
  new RegExp(`\\b${negator}\\b\\s+${words(adverbs)}${REFUSAL_VERB}\\b\\s+${words(3)}${SPONSORSHIP}\\b`, "i");

const NEGATIVE: RegExp[] = [
  /\bno\s+(?:visa\s+|immigration\s+)?sponsor(?:ship)?\b/i,
  /\b(?:visa\s+)?sponsor(?:ship)?\b(?:\s*,\s*[^,.]{1,30},)?(?:\s*:\s*|\s+(?:is|are|was|were)\s+|\s+)?(?:not|never)\s+(?:currently\s+)?(?:available|offered|provided)\b/i,
  refuses("(?:do|does|did|will|would|can|could|may|might)\\s+not", 1),
  refuses("(?:don|doesn|didn|won|wouldn|can|couldn)['\u2019]t", 1),
  /\bcannot\s+sponsor\b/i,
  /\bnot\s+able\s+to\s+sponsor\b/i,
  refuses("cannot", 1),
  refuses("(?:may|might|can|could|will|would)\\s+not\\s+be\\s+able\\s+to"),
  refuses("(?:not|n['\u2019]t)\\s+able\\s+to"),
  refuses("unable\\s+to"),
  new RegExp(`\\b(?:not|n['\u2019]t)\\s+able\\s+to\\s+consider\\b${GAP}\\b(?:requir\\w*|need\\w*)\\b\\s+${words(6)}${SPONSORSHIP}\\b`, "i"),
  new RegExp(`\\bnot\\s+be\\s+able\\s+to\\b${GAP},?\\s*\\b(?:or|nor)\\s+${REFUSAL_VERB}\\b\\s+${words(3)}${SPONSORSHIP}\\b`, "i"),
  /\bmust\s+(?:already\s+)?(?:have|hold|possess|meet)\b[^.]{0,50}?\b(?:right\s+to\s+work|work\s+authorization|authorization\s+to\s+work|(?:own\s+)?work\s+permits?)\b/i,
  /\b(?:right\s+to\s+work|work\s+(?:permit|authorization|authorisation))\s+(?:is\s+|are\s+)?(?:already\s+)?(?:required|a\s+condition)\b/i,
  /\bwithout\s+sponsorship\b/i,
  /\bnot\s+eligible\s+for\s+(?:visa\s+|immigration\s+)?sponsor(?:ship)?\b/i,
  /\b(?:hold|holds|holding)\s+(?:their\s+)?own\s+(?:right\s+to\s+work|work\s+permit)\b/i,
  /\bmust\b[^.!?\n]{0,60}?\b(?:be\s+)?(?:\w+\s+)?(?:authori[sz]ed|eligible)\s+to\s+work\b/i,
  // the modal is required: "you need to have existing right to work" stands in a posting that does sponsor
  /\b(?:will|would)\s+need\s+(?:to\s+have\s+)?(?:\w+\s+){0,2}?right\s+to\s+work\b/i,
  /\b(?:applicants|candidates)\s+who\s+(?:already\s+|currently\s+)?(?:have|hold)\s+(?:an?\s+)?(?:current|existing|valid)\s+right\s+to\s+work\b/i,
  /\b(?:ask|require)\s+(?:all\s+)?(?:applicants|candidates)\s+to\s+(?:confirm|prove|demonstrate)\b[^.!?\n]{0,30}?\b(?:their\s+)?right\s+to\s+work\b/i,
  /\bmust\s+(?:\S+\s+){0,8}?be\s+(?:an?\s+)?(?:\S+\s+){0,3}?citizens?\b/i,
  /\b(?:united\s+states|u\.s\.)\s+citizenship\b/i,
  /\b(?:passport|citizenship)[,\s]+(?:and\/or|and|or)\s+(?:valid\s+)?work\s+(?:authorization|authorisation)\b/i,
  /\bavailable\s+to\s+candidates\s+(?:who\s+are\s+)?(?:already\s+|currently\s+)?eligible\s+to\s+work\b/i,
  /\bonly\s+with\s+(?:an?\s+)?(?:valid\s+|existing\s+|current\s+)?right\s+to\s+work\b/i,
];

const RELOCATION_POSITIVE: RegExp[] = [
  /\brelocation\s+(?:support|assistance|package|benefits?)\b/i,
  /\brelocation\s+(?:support|assistance)\s+(?:can\s+be|will\s+be|is|are)\s+(?:provided|offered|available)\b/i,
  /\bassist(?:ance)?\s+with\s+relocation\b/i,
];

const RELOCATION_NEGATIVE: RegExp[] = [
  /\bnot\s+eligible\s+for\s+relocation\b/i,
  /\brelocation\s+(?:support|assistance|package|benefits?)\b[^.!?\n]{0,20}?\b(?:(?:not|never)\s+(?:be\s+)?|cannot\s+be\s+|can['\u2019]t\s+be\s+)(?:currently\s+)?(?:available|offered|provided)\b/i,
  /\bno\s+relocation\s+(?:support|assistance|package|benefits?)\b/i,
];

type Span = [number, number];

/** 150 and not 200: the 160 character run-on line of the tests must be cut to its clause, and the longest refusal sentence that is quoted whole is 136 characters long. */
const WHOLE_SENTENCE_MAX = 150;
const QUOTE_MAX = 200;
const CONTEXT_BEFORE = 120;

const BOUNDARY = /\r\n?|\n+|(?<=[.!?]["'\u2019\u201d)\]]?)[^\S\r\n]+/g;
const ABBREVIATION = /\b[A-Za-z]\.$/;
const CLAUSE_MARK = /.*(?:[,:;]|(?<=\s)\p{Pd}|\p{Pd}(?=\s))/u;

export function detectVisa(text: string): VisaSignal {
  if (!text) return "unknown";
  return decide(text, NEGATIVE, POSITIVE);
}

/**
 * The sentence that carries the visa signal, quoted as evidence on the
 * job detail page; a long run-on line is cut to the clause that carries it.
 * Negative sentences win for the same reason as in detectVisa; returns null
 * when the signal is unknown.
 */
export function visaEvidence(text: string): string | null {
  if (!text) return null;
  return detectVisa(text) === "unknown" ? null : evidence(text, [NEGATIVE, POSITIVE]);
}

/** Relocation support read on its own; it never feeds the visa signal. */
export function detectRelocation(text: string): VisaSignal {
  if (!text) return "unknown";
  return decide(text, RELOCATION_NEGATIVE, RELOCATION_POSITIVE);
}

/** The sentence that carries the relocation signal; null when the signal is unknown. */
export function relocationEvidence(text: string): string | null {
  if (!text) return null;
  return detectRelocation(text) === "unknown" ? null : evidence(text, [RELOCATION_NEGATIVE, RELOCATION_POSITIVE]);
}

function decide(text: string, refusals: RegExp[], affirmations: RegExp[]): VisaSignal {
  if (refusals.some((pattern) => pattern.test(text))) return "no";
  if (affirmations.some((pattern) => pattern.test(text))) return "yes";
  return "unknown";
}

function evidence(text: string, patternLists: RegExp[][]): string | null {
  const parts = segments(text);
  for (const patterns of patternLists) {
    for (const part of parts) {
      const span = spanIn(part, patterns);
      if (!span) continue;
      return part.length <= WHOLE_SENTENCE_MAX ? part.trim() : clause(part, span);
    }
  }
  return null;
}

function segments(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const boundary of text.matchAll(BOUNDARY)) {
    const part = text.slice(start, boundary.index);
    // the period of an abbreviation such as U.S. does not end a sentence
    if (ABBREVIATION.test(part) && !boundary[0].includes("\n")) continue;
    if (part) parts.push(part);
    start = boundary.index + boundary[0].length;
  }
  const last = text.slice(start);
  if (last) parts.push(last);
  return parts;
}

/** The leftmost hit in a segment, extended by the hits that overlap it. */
function spanIn(part: string, patterns: RegExp[]): Span | null {
  const hits: Span[] = [];
  for (const pattern of patterns) {
    const hit = pattern.exec(part);
    if (hit) hits.push([hit.index, hit.index + hit[0].length]);
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a[0] - b[0]);
  const [start] = hits[0];
  let end = start;
  for (const [from, to] of hits) if (from <= end && to > end) end = to;
  return [start, end];
}

/** The clause of a long segment that holds `span`: from the nearest comma, colon, semicolon or dash to the end of the span. */
function clause(segment: string, [from, to]: Span): string {
  const floor = Math.max(0, from - CONTEXT_BEFORE);
  const head = segment.slice(floor, from).match(CLAUSE_MARK);
  let start = head ? floor + head[0].length : floor;
  // the limit of 120 characters can fall inside a word
  if (!head) start = wordStart(segment, start);
  const quote = segment.slice(start, to).trim();
  return quote.length <= QUOTE_MAX ? quote : quote.slice(0, QUOTE_MAX).replace(/\s+\S*$/, "");
}

function wordStart(text: string, at: number): number {
  if (at === 0 || /\s/.test(text[at - 1])) return at;
  const space = text.indexOf(" ", at);
  return space === -1 ? at : space + 1;
}
