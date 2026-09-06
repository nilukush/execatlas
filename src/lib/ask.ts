/**
 * Deterministic question answering over the job index: parses a free-text
 * question like "is it possible to get a VP Engineering role in Dubai with
 * visa sponsorship?" into structured filters and answers it with the existing
 * search engine. No model, no network: the question drives the same filter
 * pipeline the jobs browser uses.
 */

import type { IndexEntry } from "./types";
import type { Seniority } from "./roles";
import { findCountryInText, findRegionInText, type RegionId } from "./locations";
import { applyFilters, DEFAULT_FILTERS } from "./search";

export interface QuestionIntent {
  query: string; // subject tokens, e.g. "engineering product"; "" when none
  seniority: Seniority | "all";
  region: RegionId | "all";
  country: string; // iso2 or "all"
  visa: "all" | "yes";
  workMode: "all" | "remote" | "hybrid" | "onsite";
}

const DEFAULT_INTENT: QuestionIntent = {
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

/** Subject words the question mentions; "software" collapses into "engineering". */
function detectQuery(t: string): string {
  const tokens: string[] = [];
  if (/\bengineering\b|\bsoftware\b/.test(t)) tokens.push("engineering");
  if (/\bproduct\b/.test(t)) tokens.push("product");
  if (/\btechnology\b|\btech\b/.test(t)) tokens.push("technology");
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
    query: detectQuery(t),
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

  return intent;
}

export interface AskAnswer {
  yes: boolean;
  count: number;
  total: number;
  /** Up to three matching roles, newest first. */
  top: IndexEntry[];
  intent: QuestionIntent;
}

export function answerQuestion(question: string, entries: IndexEntry[]): AskAnswer {
  const intent = parseQuestion(question);
  const matches = applyFilters(entries, {
    ...DEFAULT_FILTERS,
    query: intent.query,
    seniority: intent.seniority,
    region: intent.region,
    country: intent.country,
    visa: intent.visa,
    workMode: intent.workMode,
    sort: "newest",
  });
  return {
    yes: matches.length > 0,
    count: matches.length,
    total: entries.length,
    top: matches.slice(0, 3),
    intent,
  };
}
