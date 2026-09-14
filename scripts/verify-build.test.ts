import { describe, expect, it } from "vitest";
import { expectedSitemapUrlCount, indexHasMetaRefresh, isLocalizedHtml } from "./verify-build";

describe("expectedSitemapUrlCount", () => {
  it("multiplies locales by static paths, list pages and jobs", () => {
    expect(expectedSitemapUrlCount({ jobs: 240, pageCount: 10, locales: 4, staticPaths: 3 })).toBe(
      4 * (3 + 9 + 240)
    );
  });

  it("handles a single page of results", () => {
    expect(expectedSitemapUrlCount({ jobs: 5, pageCount: 1, locales: 4, staticPaths: 3 })).toBe(4 * 8);
  });
});

describe("indexHasMetaRefresh", () => {
  it("accepts a real meta refresh to the default locale", () => {
    expect(indexHasMetaRefresh('<html><head><meta http-equiv="refresh" content="0;url=/en"/></head></html>')).toBe(true);
  });

  it("rejects the bare RSC redirect shell", () => {
    expect(indexHasMetaRefresh('<html><head></head><body>NEXT_REDIRECT;replace;/en;307</body></html>')).toBe(false);
  });

  it("tolerates attribute order and spacing variants", () => {
    expect(
      indexHasMetaRefresh('<meta content="0; url=/en" http-equiv="refresh">')
    ).toBe(true);
  });
});

describe("isLocalizedHtml", () => {
  it("checks lang and dir on the html element", () => {
    expect(isLocalizedHtml('<html lang="ar" dir="rtl"><body></body></html>', "ar")).toBe(true);
    expect(isLocalizedHtml('<html lang="en" dir="ltr"><body></body></html>', "ar")).toBe(false);
    expect(isLocalizedHtml("no html tag", "ar")).toBe(false);
  });
});
