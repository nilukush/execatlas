import type { Domain } from "./roles";
import type { SalaryBand } from "./types";
import benchmarksJson from "@/data/salary/benchmarks.json";
import conventionsJson from "@/data/salary/conventions.json";

export const SALARY_ATTRIBUTION =
  "Salary estimates from the ExpatRate benchmark dataset (expatrate.pages.dev), CC BY 4.0.";

export interface BenchmarkRow {
  f: string;
  l: string;
  c: string;
  currency: string;
  b: string;
  p25: number;
  p50: number;
  p75: number;
  q: string;
}

const BENCHMARK_ROWS = (benchmarksJson as { rows: BenchmarkRow[] }).rows;
const CONVENTIONS = conventionsJson as {
  defaultMonthsPerYear: number;
  thirteenthMonth: string[];
  thr: string[];
};

/** ExpatRate levels: every ExecAtlas role is executive track. */
const LEVEL_CHAIN = ["executive", "lead"] as const;

const FAMILY_CHAIN: Record<Domain, string[]> = {
  engineering: ["it-executive", "software-engineering", "data-and-ai"],
  technology: ["it-executive", "software-engineering", "data-and-ai"],
  "engineering-product": ["it-executive", "software-engineering", "product-management"],
};

export function monthsPerYear(iso3: string): number {
  if (CONVENTIONS.thirteenthMonth.includes(iso3) || CONVENTIONS.thr.includes(iso3)) {
    return 13;
  }
  return CONVENTIONS.defaultMonthsPerYear;
}

/**
 * Estimated annual gross band (P25 to P75) in the local currency of the
 * country, from the vendored ExpatRate benchmarks. Returns null when the
 * country has no benchmark coverage rather than inventing a number.
 */
export function estimateSalary(
  countryIso3: string,
  domain: Domain,
  rows: BenchmarkRow[] = BENCHMARK_ROWS
): SalaryBand | null {
  for (const family of FAMILY_CHAIN[domain]) {
    for (const level of LEVEL_CHAIN) {
      const row = rows.find((r) => r.c === countryIso3 && r.f === family && r.l === level);
      if (row) return toAnnualBand(row);
    }
  }
  return null;
}

function toAnnualBand(row: BenchmarkRow): SalaryBand {
  const months = row.b === "monthly-gross" ? monthsPerYear(row.c) : 12;
  // partial bands collapse to the median, mirroring ExpatRate's engine
  const minMonthly = row.p25 > 0 ? row.p25 : row.p50;
  const maxMonthly = row.p75 > 0 ? row.p75 : row.p50;
  const min = row.b === "monthly-gross" ? minMonthly * months : minMonthly;
  const max = row.b === "monthly-gross" ? maxMonthly * months : maxMonthly;
  return {
    min,
    max,
    currency: row.currency,
    period: "annual",
    source: "estimated",
    quality: (row.q as SalaryBand["quality"]) ?? undefined,
    familyUsed: row.f,
  };
}

const LOCALE_MAP: Record<string, string> = {
  en: "en",
  hi: "hi-IN",
  ar: "ar",
  id: "id-ID",
};

/** Locale-aware range formatting, for example "AED 660,000 to AED 1,080,000". */
export function formatSalaryBand(band: SalaryBand, locale = "en"): string {
  const intlLocale = LOCALE_MAP[locale] ?? "en";
  // ICU uses narrow no-break spaces inside currency strings; normalize for
  // consistent rendering and testability. A malformed currency code from a
  // feed must never take down a page, so fall back to plain numbers.
  const clean = (n: number) => {
    try {
      return new Intl.NumberFormat(intlLocale, {
        style: "currency",
        currency: band.currency,
        maximumFractionDigits: 0,
      })
        .format(n)
        .replace(/[\u00A0\u202F]/g, " ");
    } catch {
      return `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(n)} ${band.currency}`;
    }
  };
  return `${clean(band.min)} to ${clean(band.max)}`;
}

// ---------------------------------------------------------------------------
// Stated salary parsing from posting text
// ---------------------------------------------------------------------------

const ISO_CODES = [
  "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "JOD", "INR", "SGD", "MYR", "THB",
  "IDR", "PHP", "VND", "EGP", "MAD", "TND", "DZD", "LYD", "SDG", "GBP", "EUR",
  "USD", "CAD", "CHF", "MXN", "TRY", "PLN", "CZK", "HUF", "RON", "SEK", "NOK",
  "DKK", "ISK", "RUB", "UAH", "ILS", "BGN", "BAM", "RSD", "MKD", "GEL", "ALL",
];
const SYMBOL_CURRENCY: Record<string, string> = {
  $: "USD",
  "£": "GBP",
  "€": "EUR",
  "₹": "INR",
};
const GCC_CURRENCIES = new Set(["AED", "SAR", "QAR", "KWD", "BHD", "OMR"]);

const ANNUAL_RE =
  /\bper\s+(?:annum|year|annually)\b|\/\s*(?:yr|year|annum|pa)\b|\ba\s+year\b|\bannually\b|\bp\.?a\.?(?![a-z0-9])|\blpa\b/i;
const MONTHLY_RE = /\bper\s+month\b|\bmonthly\b|\/\s*(?:mo|month)\b|\bpm\b/i;

// a suffix must stand alone so "monthly" never reads as the m multiplier
const SUFFIX = "([kKmM](?![a-zA-Z0-9]))";
const RANGE_RE = new RegExp(
  `(\\d[\\d,.]*)\\s*${SUFFIX}?\\s*(?:-|–|—|\\bto\\b)\\s*(?:[$£€₹]|\\b[A-Z]{3}\\b)?\\s*(\\d[\\d,.]*)\\s*${SUFFIX}?`,
  "g"
);
const SINGLE_RE = new RegExp(
  `(?:[$£€₹]|\\b(${ISO_CODES.join("|")})\\b)\\s*(\\d[\\d,.]*)\\s*${SUFFIX}?`,
  "g"
);

function toNumber(raw: string, suffix?: string): number {
  const base = Number(raw.replace(/,/g, ""));
  if (suffix === "k" || suffix === "K") return base * 1_000;
  if (suffix === "m" || suffix === "M") return base * 1_000_000;
  return base;
}

function currencyBefore(text: string, index: number): string | null {
  const window = text.slice(Math.max(0, index - 14), index);
  // capture only the symbol itself; trailing whitespace belongs to the gap
  const symbol = window.match(/([$£€₹])\s*$/);
  if (symbol) return SYMBOL_CURRENCY[symbol[1]];
  const iso = window.match(new RegExp(`\\b(${ISO_CODES.join("|")})\\b[\\s:]*$`, "i"));
  if (iso) return iso[1].toUpperCase();
  return null;
}

function detectPeriod(window: string, currency: string, max: number): "annual" | "monthly" {
  if (MONTHLY_RE.test(window)) return "monthly";
  if (ANNUAL_RE.test(window)) return "annual";
  // GCC postings commonly quote monthly; below 300k in a GCC currency that is
  // the sensible reading, otherwise default to annual.
  if (GCC_CURRENCIES.has(currency) && max <= 300_000) return "monthly";
  return "annual";
}

export interface StatedSalary {
  min: number;
  max: number;
  currency: string;
  period: "annual" | "monthly";
}

/** Indian lakh quoting, e.g. "₹80 LPA to ₹120 LPA". */
function parseLakhRange(text: string): StatedSalary | null {
  const re = /(?:₹|\bINR\b)\s*([\d]+(?:\.\d+)?)\s*(?:LPA|lakhs?|l)\b/gi;
  const values: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    values.push(Number(m[1]) * 100_000);
    if (values.length === 2) break;
  }
  if (values.length === 0) return null;
  return {
    min: values[0],
    max: values[1] ?? values[0],
    currency: "INR",
    period: "annual",
  };
}

/**
 * Parses a salary range stated in posting text. Only accepts numbers with a
 * clear currency marker so that "5-10 engineers" style ranges never match.
 */
export function parseStatedSalary(text: string): StatedSalary | null {
  if (!text) return null;

  const lakh = parseLakhRange(text);
  if (lakh && lakh.min >= 100_000) return lakh;

  for (const m of text.matchAll(RANGE_RE)) {
    const currency = currencyBefore(text, m.index ?? 0) ?? currencyInside(m[0]);
    if (!currency) continue;
    const min = toNumber(m[1], m[2]);
    const max = toNumber(m[3], m[4]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) continue;
    const window = text.slice(
      Math.max(0, (m.index ?? 0) - 80),
      Math.min(text.length, (m.index ?? 0) + m[0].length + 80)
    );
    return { min, max, currency, period: detectPeriod(window, currency, max) };
  }

  for (const m of text.matchAll(SINGLE_RE)) {
    const currency = m[1] ? m[1].toUpperCase() : SYMBOL_CURRENCY[text[(m.index ?? 0)]];
    if (!currency) continue;
    const amount = toNumber(m[2], m[3]);
    if (!Number.isFinite(amount)) continue;
    const window = text.slice(
      Math.max(0, (m.index ?? 0) - 60),
      Math.min(text.length, (m.index ?? 0) + m[0].length + 60)
    );
    // a bare single number needs an explicit period marker to be trusted
    const period = MONTHLY_RE.test(window) ? "monthly" : ANNUAL_RE.test(window) ? "annual" : null;
    if (!period) continue;
    return { min: amount, max: amount, currency, period };
  }

  return null;
}

function currencyInside(match: string): string | null {
  const iso = match.toUpperCase().match(new RegExp(`\\b(${ISO_CODES.join("|")})\\b`));
  return iso ? iso[1] : null;
}
