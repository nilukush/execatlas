import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
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

function flatten(obj: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "object" && value !== null) {
      entries.push(...flatten(value as Record<string, unknown>, `${prefix}${key}.`));
    } else {
      entries.push([`${prefix}${key}`, value]);
    }
  }
  return entries;
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

  it("every locale fills every en key with a non-empty value and the same placeholder names and ICU forms", () => {
    const en = flatten(load("en") as Record<string, unknown>);
    for (const locale of locales) {
      if (locale === "en") continue;
      const other = Object.fromEntries(flatten(load(locale) as Record<string, unknown>));
      for (const [key, value] of en) {
        // a missing or blank value holds no placeholder, so the parity check alone would let it through
        expect(String(other[key] ?? "").trim().length, `${locale} ${key} is empty`).toBeGreaterThan(0);
        expect(placeholders(other[key]), `${locale} ${key}`).toEqual(placeholders(value));
      }
    }
  });
});

describe("ExpatRate mentions", () => {
  it("every mention in the four catalogs sits inside exactly one link tag", () => {
    for (const locale of locales) {
      let mentions = 0;
      let linked = 0;
      for (const [key, value] of flatten(load(locale))) {
        if (typeof value !== "string") continue;
        // a simple tag is <link>text</link>. Once every simple tag is removed, a mention left over sat
        // outside a tag, and a tag left over nests in another or never closes
        expect(value.replace(/<link>[^<>]*<\/link>/g, ""), `${locale} ${key}`).not.toMatch(/ExpatRate|link>/);
        mentions += value.split("ExpatRate").length - 1;
        linked += (value.match(/<link>[^<>]*<\/link>/g) ?? []).join(" ").split("ExpatRate").length - 1;
      }
      expect(mentions, `${locale} names ExpatRate`).toBeGreaterThan(0);
      expect(linked, `${locale} links ExpatRate`).toBe(mentions);
    }
  });
});

describe("keys that hold a tag", () => {
  // a plain t() call on a key that holds a tag throws when the page renders, and no test or build renders every page
  const leaf = (key: string) => key.slice(key.lastIndexOf(".") + 1);
  const readTree = (dir: string): Array<[string, string]> => {
    const files: Array<[string, string]> = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...readTree(path));
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push([path, readFileSync(path, "utf8")]);
    }
    return files;
  };
  const sources = ["app", "components"].flatMap((dir) => readTree(resolve(__dirname, "..", dir)));

  it("are rendered through rich text and never through a plain t() call", () => {
    const entries = flatten(load("en"));
    const tagKeys = entries.filter(([, value]) => typeof value === "string" && /<\w+>/.test(value)).map(([key]) => key);
    const plainNames = new Set(entries.filter(([key]) => !tagKeys.includes(key)).map(([key]) => leaf(key)));
    expect(tagKeys.length).toBeGreaterThan(0);

    for (const key of tagKeys) {
      const richCall = new RegExp(`\\.rich\\("${leaf(key)}"`);
      const plainCall = new RegExp(`\\bt\\w*\\("${leaf(key)}"`);
      const renderers = sources.filter(([, text]) => richCall.test(text));
      expect(renderers.map(([path]) => path), `${key} holds a tag and is not rendered with t.rich`).not.toEqual([]);
      // a plain key may share the name, as Job.salary does with Footer.salary, so only a file that renders
      // the tag key is then held to the plain calls of that name
      for (const [path, text] of plainNames.has(leaf(key)) ? renderers : sources) {
        expect(text, `${path} calls ${key} with a plain t() call`).not.toMatch(plainCall);
      }
    }
  });
});

describe("ExpatRate copy", () => {
  // the linked keys go through t.rich: the formatter calls a handler only for a tag, not for a bare {link} argument
  const linkTag = "<link>ExpatRate</link>";
  // every key that names the project, each with one link tag
  const agreedCopy: Record<string, string> = {
    "Footer.salary": "Salary benchmarks by <link>ExpatRate</link> (CC BY 4.0).",
    "Job.salaryAttribution": "Salary estimates from the <link>ExpatRate</link> benchmark dataset (CC BY 4.0).",
    "Job.estimateBandNote":
      "Estimated from <link>ExpatRate</link>, an open set of salary benchmarks by country and role family. The band lies between the 25th and the 75th percentile of annual gross pay, in local currency, and narrows where the benchmark holds fewer figures. Treat it as orientation.",
    "Job.estimateSingleNote":
      "Estimated from <link>ExpatRate</link>, an open set of salary benchmarks by country and role family. The figure is the median annual gross pay, in local currency. Treat it as orientation.",
    "About.salaryBody":
      "When a posting states a range, it is shown as stated. A stated band that cannot be pay, such as a revenue range, is replaced by an estimate. When a posting hides the number, an estimated band is computed from the country benchmarks of <link>ExpatRate</link>, a free and open salary benchmark project, for leadership roles in technology, always in the local currency of the job's country, and always labeled as an estimate.",
    "Home.featurePayBody":
      "Stated salaries are shown as posted. A stated figure that cannot be pay, such as a revenue range, is replaced by an estimate. When a posting hides the number, an estimated band from the <link>ExpatRate</link> country benchmarks fills the gap. Every estimate is labeled as an estimate.",
  };

  const read = (catalog: Record<string, unknown>, path: string): unknown =>
    path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], catalog);

  it("every locale has the six keys, each with one ExpatRate link tag", () => {
    for (const locale of locales) {
      const catalog = load(locale);
      for (const key of Object.keys(agreedCopy)) {
        const value = read(catalog, key);
        expect(typeof value, `${locale} ${key}`).toBe("string");
        const text = String(value);
        expect(text.split(linkTag).length - 1, `${locale} ${key} link tags`).toBe(1);
        expect(text, `${locale} ${key}`).not.toContain("{link}");
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
