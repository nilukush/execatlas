/**
 * Role taxonomy for ExecAtlas: the owner-specified senior leadership families
 * (Director, AVP, Assistant Vice President, VP, Vice President, Head of, CTO
 * family) crossed with engineering / technology / product-pairing subjects,
 * plus the classifier used to filter real job titles against that scope.
 */

export type Seniority = "cto" | "vp" | "avp" | "director" | "head";
export type Domain = "engineering" | "technology" | "engineering-product";

export interface RoleQuery {
  phrase: string;
  seniority: Seniority;
  domain: Domain;
}

export interface TitleClassification {
  seniority: Seniority;
  domain: Domain;
}

const SUBJECTS: Array<{ text: string; domain: Domain }> = [
  { text: "Engineering", domain: "engineering" },
  { text: "Software Engineering", domain: "engineering" },
  { text: "Engineering and Product", domain: "engineering-product" },
  { text: "Product and Engineering", domain: "engineering-product" },
  { text: "Software Engineering and Product", domain: "engineering-product" },
  { text: "Product and Software Engineering", domain: "engineering-product" },
  { text: "Technology", domain: "technology" },
  { text: "Technology and Product", domain: "engineering-product" },
  { text: "Product and Technology", domain: "engineering-product" },
];

const PREFIXES: Array<{ text: string; seniority: Seniority }> = [
  { text: "Director", seniority: "director" },
  { text: "AVP", seniority: "avp" },
  { text: "Assistant Vice President", seniority: "avp" },
  { text: "VP", seniority: "vp" },
  { text: "Vice President", seniority: "vp" },
  { text: "Head of", seniority: "head" },
];

const CTO_PHRASES: Array<{ text: string; domain: Domain }> = [
  { text: "CTO", domain: "technology" },
  { text: "Chief Technology Officer", domain: "technology" },
  { text: "CTPO", domain: "engineering-product" },
  { text: "Chief Technology and Product Officer", domain: "engineering-product" },
  { text: "CPTO", domain: "engineering-product" },
  { text: "Chief Product and Technology Officer", domain: "engineering-product" },
];

function ampersandVariant(phrase: string): string | null {
  if (!phrase.includes(" and ")) return null;
  return phrase.replace(/ and /g, " & ");
}

/**
 * Full query matrix: every prefix x subject with the owner's variations
 * ("and" also as "&", and the "of" dropped, e.g. VP of Engineering -> VP Engineering).
 */
export function buildQueryMatrix(): RoleQuery[] {
  const out: RoleQuery[] = [];
  const seen = new Set<string>();

  const push = (phrase: string, seniority: Seniority, domain: Domain) => {
    const key = phrase.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ phrase, seniority, domain });
  };

  for (const prefix of PREFIXES) {
    for (const subject of SUBJECTS) {
      const ofForm = prefix.text.endsWith("of")
        ? `${prefix.text} ${subject.text}`
        : `${prefix.text} of ${subject.text}`;
      push(ofForm, prefix.seniority, subject.domain);
      const amp = ampersandVariant(ofForm);
      if (amp) push(amp, prefix.seniority, subject.domain);
      // "of"-dropped form: "VP of Engineering" -> "VP Engineering", "Head of X" -> "Head X"
      const bare = `${prefix.text.replace(" of", "")} ${subject.text}`;
      push(bare, prefix.seniority, subject.domain);
      const bareAmp = ampersandVariant(bare);
      if (bareAmp) push(bareAmp, prefix.seniority, subject.domain);
    }
  }

  for (const cto of CTO_PHRASES) {
    push(cto.text, "cto", cto.domain);
    const amp = ampersandVariant(cto.text);
    if (amp) push(amp, "cto", cto.domain);
  }

  return out;
}

/** Bounded seed list for search-style sources (Workable). */
export function workableSeedQueries(): string[] {
  return [
    "Director of Engineering",
    "Director of Engineering and Product",
    "Director of Technology",
    "VP of Engineering",
    "VP of Engineering and Product",
    "VP of Technology",
    "Vice President of Engineering",
    "Head of Engineering",
    "Head of Technology",
    "AVP of Engineering",
    "CTO",
    "Chief Technology Officer",
    "CTPO",
  ];
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[,.;:()\[\]{}\-_|/·—–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classifies a real-world job title into the ExecAtlas scope.
 * Returns null when the title is not a senior engineering/product/technology
 * leadership role (pure product, pure business, or individual contributor).
 */
export function classifyTitle(title: string): TitleClassification | null {
  const t = normalizeTitle(title);

  const seniority = detectSeniority(t);
  if (!seniority) return null;

  const domain = detectDomain(t, seniority);
  if (!domain) return null;

  return { seniority, domain };
}

function detectSeniority(t: string): Seniority | null {
  // CTO family first: most specific titles
  if (
    /\bctpo\b/.test(t) ||
    /\bcpto\b/.test(t) ||
    /chief product and technology officer/.test(t) ||
    /chief technology and product officer/.test(t)
  ) {
    return "cto";
  }
  if (/\bcto\b/.test(t) || /chief technology officer/.test(t)) return "cto";
  if (/\bavp\b/.test(t) || /assistant vice president/.test(t) || /assistant vp\b/.test(t)) {
    return "avp";
  }
  if (/\bs?vp\b/.test(t) || /\bvps\b/.test(t) || /vice president/.test(t)) return "vp";
  if (/\bdirectors?\b/.test(t)) return "director";
  if (/\bhead\b/.test(t)) return "head";
  return null;
}

function detectDomain(t: string, seniority: Seniority): Domain | null {
  if (seniority === "cto") {
    if (/\bctpo\b|\bcpto\b/.test(t) || /product/.test(t)) return "engineering-product";
    return "technology";
  }

  const hasProduct = /\bproduct\b/.test(t);
  const hasTech =
    /\bengineering\b/.test(t) ||
    /\bsoftware\b/.test(t) ||
    /\bdevelopment\b/.test(t) ||
    /\bdeveloper\b/.test(t) ||
    /\btechnology\b/.test(t) ||
    /\btech\b/.test(t);

  if (hasProduct && hasTech) return "engineering-product";
  if (hasTech) {
    return /\btechnology\b/.test(t) && !/\bengineering\b/.test(t) && !/\bsoftware\b/.test(t)
      ? "technology"
      : "engineering";
  }
  // pure product leadership is outside the owner's specified scope
  return null;
}
