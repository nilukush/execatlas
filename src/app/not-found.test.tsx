import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("root NotFound", () => {
  it("renders locale-neutral content with links into every locale", () => {
    const html = renderToStaticMarkup(<NotFound />);
    for (const locale of ["en", "hi", "ar", "id"]) {
      expect(html).toContain(`href="/${locale}"`);
    }
    expect(html).not.toContain("This page could not be found");
  });
});
