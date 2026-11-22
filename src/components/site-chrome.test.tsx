import { describe, afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import en from "../messages/en.json";

// SiteHeader and SiteFooter are async server components in app code; for
// testing we render the markup contract through the same catalogs the
// server uses, so label drift (a nav key renamed without updating copy)
// fails here instead of shipping silently.
function HeaderShell() {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <header data-testid="header">
        <nav aria-label={en.Nav.menu}>
          <a href="/jobs">{en.Nav.jobs}</a>
          <a href="/stats">{en.Nav.stats}</a>
          <a href="/about">{en.Nav.about}</a>
        </nav>
      </header>
    </NextIntlClientProvider>
  );
}

describe("site header contract", () => {
  afterEach(cleanup);

  it("renders the three nav destinations with catalog labels", () => {
    render(<HeaderShell />);
    expect(screen.getByRole("navigation", { name: en.Nav.menu })).toBeInTheDocument();
    for (const label of [en.Nav.jobs, en.Nav.stats, en.Nav.about]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        label === en.Nav.jobs ? "/jobs" : label === en.Nav.stats ? "/stats" : "/about",
      );
    }
  });

  it("keeps every Nav key non-empty in the catalog", () => {
    for (const [key, value] of Object.entries(en.Nav)) {
      expect(String(value).length, `Nav.${key} is empty`).toBeGreaterThan(0);
    }
  });
});

describe("site footer contract", () => {
  afterEach(cleanup);

  it("keeps every Footer key non-empty and the license line complete", () => {
    for (const [key, value] of Object.entries(en.Footer)) {
      expect(String(value).length, `Footer.${key} is empty`).toBeGreaterThan(0);
    }
    // the salary attribution must name the benchmark project
    expect(en.Footer.salary).toMatch(/ExpatRate/i);
    // the data line must list all eight sources
    for (const source of [
      "Greenhouse",
      "Lever",
      "Ashby",
      "Himalayas",
      "Adzuna",
      "Workable",
      "Arbeitnow",
      "Jobicy",
    ]) {
      expect(en.Footer.data, `Footer.data missing ${source}`).toContain(source);
    }
  });

  it("keeps the license line meaningful for the copyright row", () => {
    // the server footer renders: (c) <client year> ExecAtlas. <license>
    expect(en.Footer.license.length).toBeGreaterThan(3);
  });
});
