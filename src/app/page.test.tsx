import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootPage from "./page";

describe("RootPage", () => {
  it("emits a meta refresh to the default locale that works without JavaScript", () => {
    const html = renderToStaticMarkup(<RootPage />);
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('content="0;url=/en"');
    expect(html).toContain('href="/en"');
  });
});
