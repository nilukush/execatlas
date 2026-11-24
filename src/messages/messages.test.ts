import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXPATRATE_URL } from "@/lib/salary";

const locales = ["en", "hi", "ar", "id"];

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, `${locale}.json`), "utf8"));
}

function shape(value: unknown): string {
  if (typeof value !== "object" || value === null) return typeof value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${key}:${shape((value as Record<string, unknown>)[key])}`)
    .join("|");
}

describe("message catalogs", () => {
  it("all locales share the exact same key structure", () => {
    const base = shape(load("en"));
    for (const locale of locales) {
      expect(shape(load(locale)), `locale ${locale} diverges from en`).toBe(base);
    }
  });

  it("key sections used by the app exist", () => {
    for (const locale of locales) {
      const catalog = load(locale);
      for (const section of [
        "Meta",
        "Nav",
        "Home",
        "Jobs",
        "Roles",
        "RoleType",
        "Job",
        "About",
        "Footer",
        "NotFound",
      ]) {
        expect(catalog, `${locale} missing section ${section}`).toHaveProperty(section);
      }
    }
  });
});

describe("placeholder parity", () => {
  // extract placeholder names and whether each uses ICU plural/select
  const placeholders = (value: unknown): Array<string> => {
    if (typeof value !== "string") return [];
    // strip plural/select branch bodies first, or a lone word branch like
    // one {yesterday} would read as a placeholder
    const stripped = value.replace(
      /\{\s*\w+\s*,\s*(?:plural|select)\s*,\s*((?:\s*(?:=[0-9]+|\w+)\s*\{[^{}]*\})+)\s*\}/g,
      " "
    );
    const out: Array<string> = [...stripped.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const m of value.matchAll(/\{\s*(\w+)\s*,\s*(?:plural|select)\b/g)) {
      out.push(`${m[1]}:icu`);
    }
    return out.sort();
  };

  const flatten = (obj: Record<string, unknown>, prefix = ""): Array<[string, unknown]> =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
    );

  it("every locale uses the same placeholder names and ICU forms per key", () => {
    const en = flatten(load("en") as Record<string, unknown>);
    for (const locale of locales) {
      if (locale === "en") continue;
      const other = Object.fromEntries(flatten(load(locale) as Record<string, unknown>));
      for (const [key, value] of en) {
          expect(placeholders(other[key]), `${locale} ${key}`).toEqual(placeholders(value));
      }
    }
  });
});

describe("ExpatRate copy", () => {
  // the linked keys go through t.rich: the formatter calls a handler only for a tag, not for a bare {link} argument
  const linkTag = "<link>ExpatRate</link>";
  const linkedKeys = ["Footer.salary", "Job.salaryAttribution", "Job.estimateNote", "About.salaryBody"];
  const agreedCopy: Record<string, string> = {
    "Footer.salary": "Salary benchmarks by <link>ExpatRate</link> (CC BY 4.0).",
    "Job.salaryAttribution": "Salary estimates from the <link>ExpatRate</link> benchmark dataset (CC BY 4.0).",
    "Job.estimateNote":
      "Estimated from <link>ExpatRate</link>, an open set of salary benchmarks by country and role family. The band runs from the 25th to the 75th percentile of annual gross pay, in local currency. Treat it as orientation.",
    "About.salaryBody":
      "When a posting states a range, it is shown as stated. Otherwise an estimated band is computed from the country benchmarks of <link>ExpatRate</link>, a free and open salary benchmark project, for senior technology roles, always in the local currency of the job's country, and always labeled as an estimate.",
    "Home.featurePayBody":
      "Stated salaries are shown as posted. When a posting hides the number, an estimated band from the ExpatRate country benchmarks fills the gap, always labeled as an estimate.",
  };

  const read = (catalog: Record<string, unknown>, path: string): unknown =>
    path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], catalog);

  it("every locale has the five keys, four of them with one ExpatRate link tag", () => {
    for (const locale of locales) {
      const catalog = load(locale);
      for (const key of Object.keys(agreedCopy)) {
        const value = read(catalog, key);
        expect(typeof value, `${locale} ${key}`).toBe("string");
        const text = String(value);
        if (linkedKeys.includes(key)) {
          expect(text.split(linkTag).length - 1, `${locale} ${key} link tags`).toBe(1);
          expect(text, `${locale} ${key}`).not.toContain("{link}");
        } else {
          expect(text, `${locale} ${key}`).toContain("ExpatRate");
        }
      }
    }
  });

  it("en carries the agreed wording", () => {
    const en = load("en");
    for (const [key, copy] of Object.entries(agreedCopy)) {
      expect(read(en, key), key).toBe(copy);
    }
  });

  it("EXPATRATE_URL is the public project site", () => {
    expect(EXPATRATE_URL).toBe("https://expatrate.pages.dev");
  });
});

describe("apply and listing copy", () => {
  type Catalog = { Home: Record<string, string>; Job: Record<string, string>; Stats: Record<string, string> };
  const section = (locale: string) => load(locale) as Catalog;
  // the wording each catalog leaves behind
  const oldPromise: Record<string, string> = {
    en: "employer's own posting",
    hi: "नियोक्ता की अपनी पोस्टिंग",
    ar: "صاحب العمل نفسه",
    id: "milik perusahaan sendiri",
  };
  const oldOpenRoles: Record<string, string> = {
    en: "open leadership roles",
    hi: "खुली लीडरशिप भूमिकाएँ",
    ar: "وظيفة قيادية مفتوحة",
    id: "posisi kepemimpinan terbuka",
  };
  const oldLiveRoles: Record<string, string> = {
    en: "Live roles",
    hi: "लाइव भूमिकाएं",
    ar: "وظائف مباشرة",
    id: "Peran aktif",
  };

  it("en carries the agreed wording", () => {
    const en = section("en");
    expect(en.Job.applyVia).toBe("Apply via {source}");
    expect(en.Job.apply).toBe("Apply on company site");
    expect(en.Home.statRoles).toBe("leadership roles listed");
    expect(en.Stats.roles).toBe("Roles listed");
    expect(en.Stats.liveRoles).toBe("Roles listed");
    expect(en.Home.featureApplyBody).toBe(
      "Every role links to where it was posted. Some lead to the employer's own careers site. The rest lead to the job board that carries the posting, and the button says which."
    );
  });

  it("every locale names the board on the button", () => {
    for (const locale of locales) {
      expect(section(locale).Job.applyVia.split("{source}").length - 1, locale).toBe(1);
    }
  });

  it("no locale keeps the promise that every link is the employer's own posting, or calls the roles open or live", () => {
    for (const locale of locales) {
      const { Home, Stats } = section(locale);
      expect(Home.featureApplyBody, locale).not.toContain(oldPromise[locale]);
      expect(Home.statRoles, locale).not.toBe(oldOpenRoles[locale]);
      expect(Stats.roles, locale).not.toBe(oldLiveRoles[locale]);
      expect(Stats.liveRoles, locale).toBe(Stats.roles);
    }
  });
});
