import type { VisaSignal } from "../types";

const NEGATION_CUE = "\\b(?:not(?!\\s+only\\b)|cannot|unable|never|no\\s+longer)\\b|['\u2019]t\\b";
const NOUN_CUE = `${NEGATION_CUE}|\\bno\\b|\\bunavailable\\b`;

/** One character inside a sentence. A period counts as inside only when it belongs to an abbreviation such as U.S.; a period that ends a sentence, closing quote included, ends the window. */
const SENTENCE_CHAR = "(?:(?<=\\b[A-Za-z])\\.|\\.(?=[^\\s\u201d])|[^.!?\\n])";

/** Up to 40 characters between a negation cue and a verb, inside one sentence. */
const TO_VERB = `${SENTENCE_CHAR}{0,40}`;

/** A position that is not at the edge of a new clause. A contrasting word, a semicolon, a colon, a spaced dash or an opening bracket each open one. */
const NOT_CLAUSE_EDGE =
  "(?<!\\b(?:but|yet|however|while|whereas|although|though)\\b)(?<![;:])(?<!\\s-)(?<![\\u2013\\u2014])(?![\\(\\[])";

/** Up to 40 characters before a noun, inside one clause. The window crosses a comma: a cue still governs a list item, as in "relocation, visa sponsorship, or bonuses". */
const TO_NOUN = `(?:(?:${NOT_CLAUSE_EDGE})${SENTENCE_CHAR}){0,40}`;

/** The same window, which a comma ends too. */
const TO_NOUN_ITEM = `(?:(?:${NOT_CLAUSE_EDGE})(?<!,)${SENTENCE_CHAR}){0,40}`;

/** Up to 40 characters after a noun, inside one sentence. */
const FROM_NOUN = `${SENTENCE_CHAR}{0,40}`;

/** A clause verb right after a noun, as in "relocation support, visa sponsorship is available": the noun is the subject of a clause of its own. */
const OWN_CLAUSE = "(?:\\s+sponsor(?:ship|ing))?\\s+(?:is|are)\\b";

/** A negated verb is not an affirmation: a cue in the 40 characters before the phrase disqualifies the match. "Not only" does not negate the verb. */
const verb = (phrase: string): RegExp => new RegExp(`(?<!\\b(?:${NEGATION_CUE})${TO_VERB})${phrase}`, "i");

/** A negated noun phrase is not an affirmation either: a cue in the 40 characters before or after the phrase disqualifies the match. "No" is a cue here, as it is in "No visa sponsorship available", and so is "unavailable". A cue before a comma reaches the phrase only while the phrase is not a clause of its own. */
const noun = (phrase: string): RegExp =>
  new RegExp(
    `(?<!\\b(?:${NOUN_CUE})${TO_NOUN_ITEM})${phrase}(?:(?=${OWN_CLAUSE})|(?<!\\b(?:${NOUN_CUE})${TO_NOUN}))(?!${FROM_NOUN}\\b(?:${NOUN_CUE}))`,
    "i"
  );

/** "Relocation sponsorship" speaks of moving a candidate and never of a visa. */
const NOT_RELOCATION = "(?<!\\brelocation\\s+)";

const POSITIVE: RegExp[] = [
  noun("\\bvisa sponsor(ship|ed|ing)?\\b"),
  verb("\\bsponsor(?:ing)?\\s+(?:work\\s+|your\\s+)?visas?\\b"),
  verb("\\bwe sponsor\\b"),
  noun(`${NOT_RELOCATION}\\bsponsorship\\s+(?:is\\s+|are\\s+|will\\s+be\\s+)?(?:available|offered|provided)\\b`),
  noun("\\bwork\\s+permit\\s+sponsor(ship)?\\b"),
  verb("\\bwill\\s+(?:be\\s+)?sponsor(?:ed)?\\b"),
  noun("\\bemployment\\s+visas?\\b"),
  noun("\\bassist(?:ance)?\\s+with\\s+(?:visa|work\\s+permits?)\\b"),
  verb("\\bprovides?\\s+visa\\b"),
  verb("\\b(?:will|would)\\s+make\\s+every\\s+reasonable\\s+efforts?\\s+to\\s+get\\s+you\\s+an?\\s+visa\\b"),
];

const SPONSORSHIP = `(?:visas?|${NOT_RELOCATION}sponsor(?:ship|ing)|work\\s+permits?)`;
const REFUSAL_VERB = "(?:offer|provide|sponsor|support|facilitate|include)";

/** Up to `max` words that stay inside the clause: none ends a sentence, holds a semicolon, a colon, an opening bracket or a dash, opens a contrasting clause, or is the "and" that follows a comma. A full stop inside a closing quote ends a sentence too. */
const words = (max: number): string =>
  `(?:(?!\\S*[.!?]\\u201d?\\s)(?!\\S*[;:\\(\\[])(?!\\S*[\\u2013\\u2014])(?!--+\\s)(?!(?<=,\\s)and\\b)(?!(?:but|yet|however|while|whereas|although|though)\\b)\\S+\\s+){0,${max}}?`;

/** Up to 160 characters inside one sentence. The period of an abbreviation such as U.S. is not a sentence end; letter case cannot tell them apart under the i flag. A sentence that ends inside a closing quote still ends. */
const GAP = "(?:(?<=\\b[A-Za-z])[.!?]|[.!?](?=[^\\s\u201d])|[^.!?]){0,160}?";

/** A negated verb that refuses sponsorship: `negator`, up to `adverbs` words, the verb, the thing refused. "Not only" does not negate: "We will not only sponsor visas". The thing refused must not be the subject of the next clause. */
const refuses = (negator: string, adverbs = 0): RegExp =>
  new RegExp(`\\b${negator}\\b(?!\\s+only\\b)\\s+${words(adverbs)}${REFUSAL_VERB}\\b\\s+${words(3)}${SPONSORSHIP}\\b(?!${OWN_CLAUSE})`, "i");

/** A phrase that stands between a subject and its predicate, as in "Sponsorship, in any form, is not available". */
const COMMA_PHRASE = "(?:\\s*,\\s*[^,.]{1,30},)?";
const NOUN_NOT_IS = "(?:is|are|was|were)(?:\\s+(?:(?:also|currently|always)\\s+)?not\\b|n['\u2019]t\\b)(?:\\s+be\\b)?\\s*";
const NOUN_NOT_MODAL = "(?:will|would|can|could|may|might|must)\\s+(?:not\\b|n['\u2019]t\\b)\\s+be\\b\\s*";
const NOUN_NOT_CANNOT = "(?:cannot\\b|can['\u2019]t\\b)\\s+be\\b\\s*";
const NOUN_REFUSED = "(?:currently\\s+)?(?:available|offered|provided|possible|an?\\s+option|something)\\b";
/** What follows the negation: a refused predicate, or the end of the sentence, as in "visa sponsorship is not." A comma or any other mark does not end it. */
const NOUN_TAIL = `(?:(?:${NOUN_REFUSED})|\\.)`;

const NEGATIVE: RegExp[] = [
  /\bno\s+(?:(?:visa|employment\s+visas?|work\s+permit)\s+)?sponsor(?:ship)?\b/i,
  // a refusal that negates the noun: "Visa sponsorship: No", "isn't offered", "could not be provided", "is not an option", "is not."
  // the subject is "sponsorship" or "sponsorship of a visa": a bare "sponsor" names a person, as in "the executive sponsor is not included"
  // "Sponsorship for this role is not guaranteed." stays unknown by ruling: "guaranteed" is not in the predicate list
  new RegExp(
    `\\b(?:(?:visa\\s+)?${NOT_RELOCATION}sponsorship\\b${COMMA_PHRASE}|sponsor(?:ship)?\\s+of\\s+(?:\\w+\\s+){0,3}?visas?\\b)(?:\\s*:\\s*(?:(?:not\\s+(?:be\\s+)?|never\\s+|no\\b)${NOUN_TAIL}|unavailable\\b)|\\s+(?:(?:${NOUN_NOT_IS}|${NOUN_NOT_MODAL}|${NOUN_NOT_CANNOT})${NOUN_TAIL}|(?:\\w+\\s+){0,2}?unavailable\\b))`,
    "i"
  ),
  /\b(?:employment\s+)?visas?\s+(?:are|is)(?:n['\u2019]t\s+|\s+not\s+)(?:sponsored|provided)\b/i,
  refuses("(?:do|does|did|will|would|can|could|may|might)\\s+not", 1),
  refuses("(?:don|doesn|didn|won|wouldn|can|couldn)['\u2019]t", 1),
  /\bcannot\s+sponsor\b/i,
  /\bnot\s+able\s+to\s+sponsor\b/i,
  refuses("cannot", 1),
  refuses("(?:may|might|can|could|will|would)\\s+not\\s+be\\s+able\\s+to"),
  refuses("(?:not|n['\u2019]t)\\s+able\\s+to"),
  refuses("unable\\s+to"),
  new RegExp(`\\b(?:(?:not|n['\u2019]t)\\s+able\\s+to|cannot|can['\u2019]t|unable\\s+to)\\s+consider\\b${GAP}\\b(?:requir\\w*|need\\w*)\\b\\s+${words(6)}${SPONSORSHIP}\\b`, "i"),
  new RegExp(`\\b(?:requir\\w*|need\\w*)\\s+${words(6)}${SPONSORSHIP}\\b[^,;.!?\\n]{0,60}?(?:\\bnot\\s+eligible\\b|n['\u2019]t\\s+eligible\\b)`, "i"),
  new RegExp(`\\bnot\\s+open\\s+to\\b[^,;.!?\\n]{0,60}?\\b(?:requir\\w*|need\\w*)\\s+${words(4)}${SPONSORSHIP}\\b`, "i"),
  new RegExp(`\\bnot\\s+qualify\\s+for\\s+${words(3)}${SPONSORSHIP}\\b`, "i"),
  new RegExp(`\\bmust\\s+not\\s+requir\\w*\\s+${words(6)}${SPONSORSHIP}\\b`, "i"),
  new RegExp(`\\bnot\\s+be\\s+able\\s+to\\b${GAP},?\\s*\\b(?:or|nor)\\s+${REFUSAL_VERB}\\b\\s+${words(3)}${SPONSORSHIP}\\b`, "i"),
  /\bmust\s+(?:already\s+)?(?:have|hold|possess|meet)\b[^.]{0,50}?\b(?:right\s+to\s+work|work\s+authorization|authorization\s+to\s+work|(?:own\s+)?work\s+permits?)\b/i,
  /\b(?:right\s+to\s+work|work\s+(?:permit|authorization|authorisation))\s+(?:is\s+|are\s+)?(?:already\s+)?(?:required|a\s+condition)\b/i,
  /\bwithout\s+sponsorship\b/i,
  new RegExp(`\\bnot\\s+eligible\\s+for\\s+${words(3)}${NOT_RELOCATION}sponsorship\\b`, "i"),
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

const RELOCATION_SUPPORT = "(?:support|assistance|package|benefits?|expense\\s+coverage)";

/** The one wording on record for moving a candidate; the refusal mirrors it exactly, so it cannot catch a candidate who is "not willing to relocate to Munich". */
const MOVES_CANDIDATE = "willing\\s+to\\s+relocate\\s+the\\s+right\\s+candidates?";

const RELOCATION_POSITIVE: RegExp[] = [
  noun(`\\brelocation\\s*:?\\s*${RELOCATION_SUPPORT}\\b`),
  noun("\\brelocation\\s*:?\\s*(?:support|assistance)\\s+(?:(?:can|will)\\s+be\\s+|is\\s+|are\\s+)?(?:provided|offered|available)\\b"),
  /\brelocation\s+available\b/i,
  noun("\\bassist(?:ance)?\\s+with\\s+relocation\\b"),
  verb("\\bhelp\\s+you\\s+relocate\\b"),
  noun(`\\b${MOVES_CANDIDATE}\\b`),
];

const RELOCATION_NEGATIVE: RegExp[] = [
  /\bnot\s+eligible\s+for\s+relocation\b/i,
  // "relocation sponsorship" is a refusal of relocation and never of a visa (ruling R29)
  new RegExp(
    `\\brelocation\\s*:?\\s*(?:${RELOCATION_SUPPORT}|sponsorship)\\b[^.!?\\n]{0,20}?(?:unavailable\\b|(?:\\b(?:not|never)\\s+(?:be\\s+)?|n['\u2019]t\\s+(?:be\\s+)?|cannot\\s+be\\s+|can['\u2019]t\\s+be\\s+)(?:currently\\s+)?(?:available|offered|provided|covered|included)\\b)`,
    "i"
  ),
  new RegExp(`\\bno\\s+relocation\\s+(?:${RELOCATION_SUPPORT}|available|provided|offered)\\b`, "i"),
  new RegExp(
    `\\b(?:(?:do|does|did|will|would|can|could|may|might)\\s+not|(?:don|doesn|didn|won|wouldn|can|couldn)['\u2019]t|cannot|unable\\s+to)\\s+${words(1)}(?:offer|provide|include|assist|help|pay|come)\\s+${words(3)}relocat(?:e|ion)\\b`,
    "i"
  ),
  new RegExp(`\\b(?:not|never)\\s+${MOVES_CANDIDATE}\\b`, "i"),
];

type Span = [number, number];

/** 150 and not 200: the 160 character run-on line of the tests must be cut to its clause, and the longest refusal sentence that is quoted whole is 136 characters long. */
const WHOLE_SENTENCE_MAX = 150;
const QUOTE_MAX = 200;
const CONTEXT_BEFORE = 120;

const BOUNDARY = /\r\n?|\n+|(?<=[.!?]\u201d?)[^\S\r\n]+/g;
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
