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
