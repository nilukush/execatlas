import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
