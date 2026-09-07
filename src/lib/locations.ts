/**
 * Canonical location dataset: the owner's six sourcing regions resolved to
 * countries, with currency, expat-friendliness and matching aliases.
 * Regions are the user-facing concept; countries are the matching mechanism.
 */

export type RegionId =
  | "india"
  | "middle-east"
  | "southeast-asia"
  | "north-africa"
  | "europe"
  | "north-america"
  | "remote";

export type LandRegion = Exclude<RegionId, "remote">;

export interface Region {
  id: RegionId;
  label: string;
}

export interface Country {
  iso2: string;
  iso3: string;
  name: string;
  region: LandRegion;
  currency: string;
  expatFriendly: boolean;
  aliases: string[];
}

export const REGIONS: Region[] = [
  { id: "india", label: "India" },
  { id: "middle-east", label: "Middle East" },
  { id: "southeast-asia", label: "Southeast Asia" },
  { id: "north-africa", label: "North Africa" },
  { id: "europe", label: "Europe" },
  { id: "north-america", label: "North America" },
  { id: "remote", label: "Remote" },
];

export function regionLabel(id: RegionId): string {
  return REGIONS.find((r) => r.id === id)?.label ?? id;
}

const F = false;
const T = true;

export const COUNTRIES: Country[] = [
  // India
  { iso2: "IN", iso3: "IND", name: "India", region: "india", currency: "INR", expatFriendly: F, aliases: ["india", "bharat", "bangalore", "bengaluru", "mumbai", "bombay", "delhi", "new delhi", "ncr", "gurgaon", "gurugram", "noida", "hyderabad", "pune", "chennai", "kolkata", "calcutta", "ahmedabad", "jaipur", "indore", "kochi", "coimbatore", "chandigarh"] },

  // Middle East
  { iso2: "BH", iso3: "BHR", name: "Bahrain", region: "middle-east", currency: "BHD", expatFriendly: T, aliases: ["bahrain", "manama"] },
  { iso2: "IR", iso3: "IRN", name: "Iran", region: "middle-east", currency: "IRR", expatFriendly: F, aliases: ["iran", "tehran"] },
  { iso2: "IQ", iso3: "IRQ", name: "Iraq", region: "middle-east", currency: "IQD", expatFriendly: F, aliases: ["iraq", "baghdad", "erbil"] },
  { iso2: "IL", iso3: "ISR", name: "Israel", region: "middle-east", currency: "ILS", expatFriendly: F, aliases: ["israel", "tel aviv", "jerusalem"] },
  { iso2: "JO", iso3: "JOR", name: "Jordan", region: "middle-east", currency: "JOD", expatFriendly: F, aliases: ["jordan", "amman"] },
  { iso2: "KW", iso3: "KWT", name: "Kuwait", region: "middle-east", currency: "KWD", expatFriendly: T, aliases: ["kuwait", "kuwait city"] },
  { iso2: "LB", iso3: "LBN", name: "Lebanon", region: "middle-east", currency: "LBP", expatFriendly: F, aliases: ["lebanon", "beirut"] },
  { iso2: "OM", iso3: "OMN", name: "Oman", region: "middle-east", currency: "OMR", expatFriendly: T, aliases: ["oman", "muscat"] },
  { iso2: "QA", iso3: "QAT", name: "Qatar", region: "middle-east", currency: "QAR", expatFriendly: T, aliases: ["qatar", "doha"] },
  { iso2: "SA", iso3: "SAU", name: "Saudi Arabia", region: "middle-east", currency: "SAR", expatFriendly: T, aliases: ["saudi arabia", "ksa", "saudi", "riyadh", "jeddah", "dammam", "neom"] },
  { iso2: "SY", iso3: "SYR", name: "Syria", region: "middle-east", currency: "SYP", expatFriendly: F, aliases: ["syria", "damascus"] },
  { iso2: "TR", iso3: "TUR", name: "Turkiye", region: "middle-east", currency: "TRY", expatFriendly: F, aliases: ["turkey", "turkiye", "istanbul", "ankara", "izmir"] },
  { iso2: "AE", iso3: "ARE", name: "United Arab Emirates", region: "middle-east", currency: "AED", expatFriendly: T, aliases: ["united arab emirates", "uae", "u.a.e", "emirates", "dubai", "abu dhabi", "sharjah", "ajman", "ras al khaimah", "fujairah"] },
  { iso2: "YE", iso3: "YEM", name: "Yemen", region: "middle-east", currency: "YER", expatFriendly: F, aliases: ["yemen", "sanaa"] },

  // Southeast Asia
  { iso2: "BN", iso3: "BRN", name: "Brunei", region: "southeast-asia", currency: "BND", expatFriendly: F, aliases: ["brunei", "bandar seri begawan"] },
  { iso2: "KH", iso3: "KHM", name: "Cambodia", region: "southeast-asia", currency: "KHR", expatFriendly: F, aliases: ["cambodia", "phnom penh"] },
  { iso2: "ID", iso3: "IDN", name: "Indonesia", region: "southeast-asia", currency: "IDR", expatFriendly: T, aliases: ["indonesia", "jakarta", "bali", "surabaya", "bandung"] },
  { iso2: "LA", iso3: "LAO", name: "Laos", region: "southeast-asia", currency: "LAK", expatFriendly: F, aliases: ["laos", "vientiane"] },
  { iso2: "MY", iso3: "MYS", name: "Malaysia", region: "southeast-asia", currency: "MYR", expatFriendly: T, aliases: ["malaysia", "kuala lumpur", "kl", "penang", "johor"] },
  { iso2: "MM", iso3: "MMR", name: "Myanmar", region: "southeast-asia", currency: "MMK", expatFriendly: F, aliases: ["myanmar", "burma", "yangon"] },
  { iso2: "PH", iso3: "PHL", name: "Philippines", region: "southeast-asia", currency: "PHP", expatFriendly: F, aliases: ["philippines", "manila", "makati", "cebu"] },
  { iso2: "SG", iso3: "SGP", name: "Singapore", region: "southeast-asia", currency: "SGD", expatFriendly: T, aliases: ["singapore", "sg"] },
  { iso2: "TH", iso3: "THA", name: "Thailand", region: "southeast-asia", currency: "THB", expatFriendly: F, aliases: ["thailand", "bangkok", "chiang mai"] },
  { iso2: "TL", iso3: "TLS", name: "Timor-Leste", region: "southeast-asia", currency: "USD", expatFriendly: F, aliases: ["timor-leste", "east timor", "dili"] },
  { iso2: "VN", iso3: "VNM", name: "Vietnam", region: "southeast-asia", currency: "VND", expatFriendly: F, aliases: ["vietnam", "viet nam", "ho chi minh city", "hcmc", "hanoi", "da nang"] },

  // North Africa
  { iso2: "DZ", iso3: "DZA", name: "Algeria", region: "north-africa", currency: "DZD", expatFriendly: F, aliases: ["algeria", "algiers", "alger"] },
  { iso2: "EG", iso3: "EGY", name: "Egypt", region: "north-africa", currency: "EGP", expatFriendly: F, aliases: ["egypt", "cairo", "alexandria", "giza"] },
  { iso2: "LY", iso3: "LBY", name: "Libya", region: "north-africa", currency: "LYD", expatFriendly: F, aliases: ["libya", "tripoli"] },
  { iso2: "MA", iso3: "MAR", name: "Morocco", region: "north-africa", currency: "MAD", expatFriendly: F, aliases: ["morocco", "casablanca", "rabat", "marrakech"] },
  { iso2: "SD", iso3: "SDN", name: "Sudan", region: "north-africa", currency: "SDG", expatFriendly: F, aliases: ["sudan", "khartoum"] },
  { iso2: "TN", iso3: "TUN", name: "Tunisia", region: "north-africa", currency: "TND", expatFriendly: F, aliases: ["tunisia", "tunis"] },

  // Europe
  { iso2: "AL", iso3: "ALB", name: "Albania", region: "europe", currency: "ALL", expatFriendly: F, aliases: ["albania", "tirana"] },
  { iso2: "BY", iso3: "BLR", name: "Belarus", region: "europe", currency: "BYN", expatFriendly: F, aliases: ["belarus", "minsk"] },
  { iso2: "BE", iso3: "BEL", name: "Belgium", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["belgium", "brussels", "antwerp", "ghent"] },
  { iso2: "BA", iso3: "BIH", name: "Bosnia and Herzegovina", region: "europe", currency: "BAM", expatFriendly: F, aliases: ["bosnia and herzegovina", "bosnia", "sarajevo"] },
  { iso2: "BG", iso3: "BGR", name: "Bulgaria", region: "europe", currency: "BGN", expatFriendly: F, aliases: ["bulgaria", "sofia"] },
  { iso2: "HR", iso3: "HRV", name: "Croatia", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["croatia", "zagreb", "split"] },
  { iso2: "CY", iso3: "CYP", name: "Cyprus", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["cyprus", "nicosia", "limassol"] },
  { iso2: "CZ", iso3: "CZE", name: "Czechia", region: "europe", currency: "CZK", expatFriendly: T, aliases: ["czechia", "czech republic", "prague", "praha", "brno"] },
  { iso2: "DK", iso3: "DNK", name: "Denmark", region: "europe", currency: "DKK", expatFriendly: F, aliases: ["denmark", "copenhagen", "aarhus"] },
  { iso2: "EE", iso3: "EST", name: "Estonia", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["estonia", "tallinn"] },
  { iso2: "FI", iso3: "FIN", name: "Finland", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["finland", "helsinki"] },
  { iso2: "FR", iso3: "FRA", name: "France", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["france", "paris", "lyon", "toulouse", "nice"] },
  { iso2: "GE", iso3: "GEO", name: "Georgia", region: "europe", currency: "GEL", expatFriendly: T, aliases: ["georgia", "tbilisi", "batumi"] },
  { iso2: "DE", iso3: "DEU", name: "Germany", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["germany", "deutschland", "berlin", "munich", "munchen", "hamburg", "frankfurt"] },
  { iso2: "GR", iso3: "GRC", name: "Greece", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["greece", "athens", "thessaloniki"] },
  { iso2: "HU", iso3: "HUN", name: "Hungary", region: "europe", currency: "HUF", expatFriendly: F, aliases: ["hungary", "budapest"] },
  { iso2: "IS", iso3: "ISL", name: "Iceland", region: "europe", currency: "ISK", expatFriendly: F, aliases: ["iceland", "reykjavik"] },
  { iso2: "IE", iso3: "IRL", name: "Ireland", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["ireland", "dublin", "cork"] },
  { iso2: "IT", iso3: "ITA", name: "Italy", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["italy", "italia", "milan", "milano", "rome", "roma", "turin"] },
  { iso2: "XK", iso3: "XKX", name: "Kosovo", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["kosovo", "pristina"] },
  { iso2: "LV", iso3: "LVA", name: "Latvia", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["latvia", "riga"] },
  { iso2: "LT", iso3: "LTU", name: "Lithuania", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["lithuania", "vilnius"] },
  { iso2: "LU", iso3: "LUX", name: "Luxembourg", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["luxembourg"] },
  { iso2: "MT", iso3: "MLT", name: "Malta", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["malta", "valletta"] },
  { iso2: "MD", iso3: "MDA", name: "Moldova", region: "europe", currency: "MDL", expatFriendly: F, aliases: ["moldova", "chisinau"] },
  { iso2: "ME", iso3: "MNE", name: "Montenegro", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["montenegro", "podgorica"] },
  { iso2: "NL", iso3: "NLD", name: "Netherlands", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["netherlands", "the netherlands", "holland", "amsterdam", "the hague", "rotterdam", "utrecht", "eindhoven"] },
  { iso2: "MK", iso3: "MKD", name: "North Macedonia", region: "europe", currency: "MKD", expatFriendly: F, aliases: ["north macedonia", "macedonia", "skopje"] },
  { iso2: "NO", iso3: "NOR", name: "Norway", region: "europe", currency: "NOK", expatFriendly: F, aliases: ["norway", "oslo", "bergen"] },
  { iso2: "PL", iso3: "POL", name: "Poland", region: "europe", currency: "PLN", expatFriendly: T, aliases: ["poland", "warsaw", "warszawa", "krakow", "krakow", "wroclaw", "gdansk"] },
  { iso2: "PT", iso3: "PRT", name: "Portugal", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["portugal", "lisbon", "lisboa", "porto", "braga"] },
  { iso2: "RO", iso3: "ROU", name: "Romania", region: "europe", currency: "RON", expatFriendly: F, aliases: ["romania", "bucharest", "cluj"] },
  { iso2: "RU", iso3: "RUS", name: "Russia", region: "europe", currency: "RUB", expatFriendly: F, aliases: ["russia", "moscow", "saint petersburg", "stpetersburg"] },
  { iso2: "RS", iso3: "SRB", name: "Serbia", region: "europe", currency: "RSD", expatFriendly: F, aliases: ["serbia", "belgrade", "novi sad"] },
  { iso2: "SK", iso3: "SVK", name: "Slovakia", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["slovakia", "bratislava"] },
  { iso2: "SI", iso3: "SVN", name: "Slovenia", region: "europe", currency: "EUR", expatFriendly: F, aliases: ["slovenia", "ljubljana"] },
  { iso2: "ES", iso3: "ESP", name: "Spain", region: "europe", currency: "EUR", expatFriendly: T, aliases: ["spain", "espana", "madrid", "barcelona", "valencia", "sevilla"] },
  { iso2: "SE", iso3: "SWE", name: "Sweden", region: "europe", currency: "SEK", expatFriendly: T, aliases: ["sweden", "stockholm", "gothenburg"] },
  { iso2: "CH", iso3: "CHE", name: "Switzerland", region: "europe", currency: "CHF", expatFriendly: T, aliases: ["switzerland", "zurich", "geneva", "basel", "lausanne"] },
  { iso2: "UA", iso3: "UKR", name: "Ukraine", region: "europe", currency: "UAH", expatFriendly: F, aliases: ["ukraine", "kyiv", "kiev", "lviv"] },
  { iso2: "GB", iso3: "GBR", name: "United Kingdom", region: "europe", currency: "GBP", expatFriendly: T, aliases: ["united kingdom", "uk", "great britain", "britain", "england", "scotland", "wales", "northern ireland", "london", "manchester", "birmingham", "leeds", "edinburgh", "bristol"] },

  // North America
  { iso2: "CA", iso3: "CAN", name: "Canada", region: "north-america", currency: "CAD", expatFriendly: T, aliases: ["canada", "toronto", "vancouver", "montreal", "ottawa", "calgary"] },
  { iso2: "US", iso3: "USA", name: "United States", region: "north-america", currency: "USD", expatFriendly: T, aliases: ["united states", "united states of america", "usa", "us", "america", "new york", "san francisco", "bay area", "seattle", "austin", "chicago", "boston", "los angeles", "denver", "atlanta", "washington dc"] },
  { iso2: "MX", iso3: "MEX", name: "Mexico", region: "north-america", currency: "MXN", expatFriendly: T, aliases: ["mexico", "mexico city", "cdmx", "guadalajara", "monterrey"] },
];

const COUNTRY_BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));

export function countryByIso3(iso3: string): Country | undefined {
  return COUNTRY_BY_ISO3.get(iso3);
}

const COUNTRY_BY_ISO2 = new Map(COUNTRIES.map((c) => [c.iso2, c]));

export function countryByIso2(iso2: string): Country | undefined {
  return COUNTRY_BY_ISO2.get(iso2);
}

export const REGION_ALIASES: Array<{ alias: string; region: LandRegion }> = [
  { alias: "middle east", region: "middle-east" },
  { alias: "middle-east", region: "middle-east" },
  { alias: "gcc", region: "middle-east" },
  { alias: "gulf", region: "middle-east" },
  { alias: "southeast asia", region: "southeast-asia" },
  { alias: "south east asia", region: "southeast-asia" },
  { alias: "south-east asia", region: "southeast-asia" },
  { alias: "north africa", region: "north-africa" },
  { alias: "north-africa", region: "north-africa" },
  { alias: "europe", region: "europe" },
  { alias: "north america", region: "north-america" },
  { alias: "india", region: "india" },
];

export interface ResolvedLocation {
  country: Country | null;
  region: RegionId | null;
  remote: boolean;
  raw: string;
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,;()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REMOTE_RE = /\bremote\b|\banywhere\b|\bwork from (?:home|anywhere)\b|\bwfh\b/i;

/**
 * Resolves a free-text location string from a job posting against the
 * dataset. Returns null when nothing in scope matches.
 * A "Remote - United States" style string yields both the country and the
 * remote flag; a bare region name yields the region without a country.
 */
export function resolveLocation(raw: string): ResolvedLocation | null {
  const normalized = normalize(raw);
  if (!normalized) return null;

  const remote = REMOTE_RE.test(raw);

  // Country match: longest matching alias wins; short aliases (under 4 chars)
  // must match a whole token to avoid false positives.
  const best = findCountryInText(normalized);

  if (best) {
    return { country: best, region: best.region, remote, raw };
  }

  const region = findRegionInText(normalized);
  if (region) {
    return { country: null, region, remote, raw };
  }

  if (remote) {
    return { country: null, region: null, remote: true, raw };
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest country alias found as a whole phrase in normalized free text. */
export function findCountryInText(normalized: string): Country | null {
  const tokens = new Set(normalized.split(" "));
  let best: { country: Country; length: number } | null = null;
  for (const country of COUNTRIES) {
    for (const alias of [country.name.toLowerCase(), ...country.aliases]) {
      const aliasNorm = normalize(alias);
      if (aliasNorm.length < 4) {
        if (tokens.has(aliasNorm) && (!best || aliasNorm.length > best.length)) {
          best = { country, length: aliasNorm.length };
        }
      } else if (
        new RegExp(`\\b${escapeRe(aliasNorm)}\\b`).test(normalized) &&
        (!best || aliasNorm.length > best.length)
      ) {
        best = { country, length: aliasNorm.length };
      }
    }
  }
  return best?.country ?? null;
}

/** Region whose alias appears in normalized free text, null when none. */
export function findRegionInText(normalized: string): LandRegion | null {
  for (const { alias, region } of REGION_ALIASES) {
    if (new RegExp(`\\b${escapeRe(normalize(alias))}\\b`).test(normalized)) {
      return region;
    }
  }
  return null;
}
