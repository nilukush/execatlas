/**
 * Deterministic question answering over the job index: parses a free-text
 * question like "is it possible to get a VP Engineering role in Dubai with
 * visa sponsorship?" into structured filters and answers it with the existing
 * search engine. No model, no network: the question drives the same filter
 * pipeline the jobs browser uses. When nothing matches, one constraint is
 * relaxed at a time to suggest the closest viable alternative.
 */

import type { IndexEntry } from "./types";
import type { Seniority } from "./roles";
import {
  findCountryInText,
  findRegionInText,
  REGION_ALIASES,
  type Country,
  type LandRegion,
  type RegionId,
} from "./locations";
import { applyFilters, DEFAULT_FILTERS, type JobFilters } from "./search";

export interface QuestionIntent {
  query: string; // subject tokens plus leftover keywords, e.g. "engineering stripe"
  seniority: Seniority | "all";
  region: RegionId | "all";
  country: string; // iso2 or "all"
  visa: "all" | "yes";
  workMode: "all" | "remote" | "hybrid" | "onsite";
}

export const DEFAULT_INTENT: QuestionIntent = {
  query: "",
  seniority: "all",
  region: "all",
  country: "all",
  visa: "all",
  workMode: "all",
};

function normalizeQuestion(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,;:?!()\[\]'"'\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSeniority(t: string): Seniority | "all" {
  if (/\bctpo\b|\bcpto\b|\bcto\b|chief technology officer/.test(t)) return "cto";
  if (/\bavp\b|assistant vice president/.test(t)) return "avp";
  if (/\bs?vp\b|\bvps\b|vice president/.test(t)) return "vp";
  if (/\bdirectors?\b/.test(t)) return "director";
  if (/\bheads?\b/.test(t)) return "head";
  return "all";
}

const VISA_PHRASES_RE =
  /\b(?:without|no)\s+(?:a\s+)?(?:visa|sponsorship|sponsoring)\b|\bvisa\b|\bsponsor(?:ship|ing)?\b|\bwork permit\b/g;
const WORKMODE_PHRASES_RE =
  /\bremote(?:ly)?\b|\bwork from home\b|\bwfh\b|\bhybrid\b|\bonsite\b|\bon site\b|\bin (?:the )?office\b/g;
const SENIORITY_PHRASES_RE =
  /\bassistant vice president\b|\bvice president\b|\bchief technology officer\b|\bctpo\b|\bcpto\b|\bavp\b|\bs?vp\b|\bvps\b|\bcto\b|\bdirectors?\b|\bheads?\b/g;
const SUBJECT_WORDS_RE = /\bengineering\b|\bsoftware\b|\bproduct\b|\btechnology\b|\btech\b/g;

/** Words that carry no retrieval signal once the dimension phrases are gone. */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "do", "does", "did",
  "have", "has", "had", "can", "could", "will", "would", "should", "may", "might",
  "must", "i", "you", "we", "they", "it", "this", "that", "these", "those", "there",
  "here", "any", "some", "all", "no", "not", "with", "without", "at", "in", "on",
  "of", "for", "to", "from", "by", "as", "and", "or", "but", "if", "then", "than",
  "so", "such", "job", "jobs", "role", "roles", "position", "positions", "career",
  "careers", "opportunity", "opportunities", "work", "works", "working", "get",
  "gets", "getting", "find", "finds", "finding", "show", "showing", "me", "my",
  "please", "possible", "possibly", "available", "opening", "openings", "company",
  "companies", "firm", "firms", "hiring", "hire", "hires", "looking", "look",
  "based", "location", "located", "near", "abroad", "overseas", "leadership",
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPhrase(text: string, phrase: string): string {
  return text.replace(new RegExp(`\\b${escapeRe(phrase)}\\b`, "g"), " ");
}

/** Subject words plus any leftover keyword (often a company name) from the question. */
function detectQuery(t: string, country: Country | null, region: LandRegion | null): string {
  const subjects: string[] = [];
  if (/\bengineering\b|\bsoftware\b/.test(t)) subjects.push("engineering");
  if (/\bproduct\b/.test(t)) subjects.push("product");
  if (/\btechnology\b|\btech\b/.test(t)) subjects.push("technology");

  let rest = t
    .replace(VISA_PHRASES_RE, " ")
    .replace(WORKMODE_PHRASES_RE, " ")
    .replace(SENIORITY_PHRASES_RE, " ")
    .replace(SUBJECT_WORDS_RE, " ");

  if (country) {
    for (const phrase of [country.name.toLowerCase(), ...country.aliases]) {
      rest = stripPhrase(rest, phrase);
    }
  } else if (region) {
    for (const { alias, region: r } of REGION_ALIASES) {
      if (r === region) rest = stripPhrase(rest, alias);
    }
  }

  const leftover = rest
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w) && w.length >= 3 && !/^\d+$/.test(w))
    .slice(0, 3);

  const tokens = [...subjects, ...leftover.filter((w) => !subjects.includes(w))];
  return tokens.join(" ");
}

function detectVisa(t: string): "all" | "yes" {
  if (/\b(?:without|no)\s+(?:a\s+)?(?:visa|sponsorship|sponsoring)\b|\bunsponsored\b/.test(t)) return "all";
  if (/\bvisa\b|\bsponsor(?:ship|ing)?\b|\bwork permit\b/.test(t)) return "yes";
  return "all";
}

function detectWorkMode(t: string): QuestionIntent["workMode"] {
  if (/\bremote(?:ly)?\b|\bwork from home\b|\bwfh\b/.test(t)) return "remote";
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bonsite\b|\bon site\b|\bin (?:the )?office\b/.test(t)) return "onsite";
  return "all";
}

export function parseQuestion(question: string): QuestionIntent {
  const t = normalizeQuestion(question);
  if (!t) return DEFAULT_INTENT;

  const intent: QuestionIntent = {
    ...DEFAULT_INTENT,
    seniority: detectSeniority(t),
    visa: detectVisa(t),
    workMode: detectWorkMode(t),
  };

  const country = findCountryInText(t);
  if (country) {
    intent.country = country.iso2;
    intent.region = country.region;
  } else {
    const region = findRegionInText(t);
    if (region) intent.region = region;
  }

  intent.query = detectQuery(
    t,
    country,
    intent.region !== "all" && intent.region !== "remote" ? intent.region : null
  );

  return intent;
}

/** The browser filter set an intent maps to; shared by answers and the UI. */
export function intentFilters(intent: QuestionIntent): JobFilters {
  return {
    ...DEFAULT_FILTERS,
    query: intent.query,
    seniority: intent.seniority,
    region: intent.region,
    country: intent.country,
    visa: intent.visa,
    workMode: intent.workMode,
    sort: "newest",
  };
}

export interface AskSuggestion {
  dropped: "visa" | "location" | "seniority" | "workMode" | "query";
  count: number;
  intent: QuestionIntent;
}

const RELAXATIONS: Array<{
  dropped: AskSuggestion["dropped"];
  active: (i: QuestionIntent) => boolean;
  apply: (i: QuestionIntent) => QuestionIntent;
}> = [
  { dropped: "visa", active: (i) => i.visa !== "all", apply: (i) => ({ ...i, visa: "all" }) },
  {
    dropped: "location",
    active: (i) => i.country !== "all" || i.region !== "all",
    apply: (i) => ({ ...i, country: "all", region: "all" }),
  },
  {
    dropped: "seniority",
    active: (i) => i.seniority !== "all",
    apply: (i) => ({ ...i, seniority: "all" }),
  },
  {
    dropped: "workMode",
    active: (i) => i.workMode !== "all",
    apply: (i) => ({ ...i, workMode: "all" }),
  },
  { dropped: "query", active: (i) => i.query !== "", apply: (i) => ({ ...i, query: "" }) },
];

export interface AskAnswer {
  yes: boolean;
  count: number;
  total: number;
  /** Up to three matching roles, newest first. */
  top: IndexEntry[];
  intent: QuestionIntent;
  /** Present only when nothing matched: the single relaxation that helps most. */
  suggestion?: AskSuggestion;
}

export function answerQuestion(question: string, entries: IndexEntry[]): AskAnswer {
  const intent = parseQuestion(question);
  const matches = applyFilters(entries, intentFilters(intent));

  let suggestion: AskSuggestion | undefined;
  if (matches.length === 0) {
    let best: AskSuggestion | null = null;
    for (const { dropped, active, apply } of RELAXATIONS) {
      if (!active(intent)) continue;
      const relaxed = apply(intent);
      const count = applyFilters(entries, intentFilters(relaxed)).length;
      if (count > 0 && (!best || count > best.count)) {
        best = { dropped, count, intent: relaxed };
      }
    }
    if (best) suggestion = best;
  }

  return {
    yes: matches.length > 0,
    count: matches.length,
    total: entries.length,
    top: matches.slice(0, 3),
    intent,
    ...(suggestion ? { suggestion } : {}),
  };
}
