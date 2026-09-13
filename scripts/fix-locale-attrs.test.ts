import { describe, expect, it } from "vitest";
import { isLocalized, localeForPath, localizeHtmlAttrs } from "./fix-locale-attrs";
import { routing } from "../src/i18n/routing";

const sample = (cls = "") =>
  `<!DOCTYPE html><html lang="en" dir="ltr"${cls ? ` class="${cls}"` : ""}><head></head><body><p lang="en">stay</p></body></html>`;

describe("localizeHtmlAttrs", () => {
  it("sets lang and rtl for Arabic pages", () => {
    const out = localizeHtmlAttrs(sample("fonts"), "ar");
    expect(out).toContain('<html lang="ar" dir="rtl" class="fonts">');
  });

  it("sets lang for Hindi and Indonesian, keeping ltr", () => {
    expect(localizeHtmlAttrs(sample(), "hi")).toContain('<html lang="hi" dir="ltr');
    expect(localizeHtmlAttrs(sample(), "id")).toContain('<html lang="id" dir="ltr');
  });

  it("leaves the default locale untouched", () => {
    expect(localizeHtmlAttrs(sample(), "en")).toBe(sample());
  });

  it("only rewrites the html element, not lang attributes in the body", () => {
    const out = localizeHtmlAttrs(sample(), "ar");
    expect(out).toContain('<p lang="en">stay</p>');
  });

  it("returns the input unchanged when there is no html tag", () => {
    expect(localizeHtmlAttrs("no tag here", "ar")).toBe("no tag here");
  });
});

describe("isLocalized", () => {
  it("accepts a transformed file", () => {
    expect(isLocalized(localizeHtmlAttrs(sample(), "ar"), "ar")).toBe(true);
  });

  it("rejects a drifted html tag shape so the build fails loud", () => {
    const drifted = `<!DOCTYPE html><html lang='en'><head></head></html>`;
    expect(isLocalized(localizeHtmlAttrs(drifted, "ar"), "ar")).toBe(false);
  });

  it("covers every locale the router ships", () => {
    // a locale added to routing without a dir policy still verifies as ltr
    for (const locale of routing.locales) {
      if (locale === "en") continue;
      expect(isLocalized(localizeHtmlAttrs(sample(), locale), locale)).toBe(true);
    }
  });
});

describe("localeForPath", () => {
  it("derives the locale from nested and flat output paths", () => {
    expect(localeForPath("out/ar/jobs/some-job.html")).toBe("ar");
    expect(localeForPath("out/hi.html")).toBe("hi");
    expect(localeForPath("out/en/jobs/index.html")).toBe("en");
    expect(localeForPath("out/404.html")).toBeNull();
    expect(localeForPath("out/index.html")).toBeNull();
    expect(localeForPath("out/favicon.ico")).toBeNull();
  });
});
