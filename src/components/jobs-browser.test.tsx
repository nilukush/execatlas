import { describe, afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { JobsBrowser } from "./jobs-browser";
import en from "../messages/en.json";
import type { IndexEntry } from "@/lib/types";

function make(over: Partial<IndexEntry>): IndexEntry {
  return {
    id: over.id ?? "j1",
    title: over.title ?? "VP of Engineering",
    company: over.company ?? "Acme",
    seniority: over.seniority ?? "vp",
    domain: over.domain ?? "engineering",
    countryIso2: over.countryIso2 ?? "AE",
    countryName: over.countryName ?? "United Arab Emirates",
    region: over.region ?? "middle-east",
    remote: over.remote ?? false,
    visa: over.visa ?? "unknown",
    workMode: over.workMode ?? "onsite",
    roleType: over.roleType ?? "permanent",
    experienceMin: over.experienceMin,
    experienceMax: over.experienceMax,
    salaryMin: over.salaryMin,
    salaryMax: over.salaryMax,
    salaryCurrency: over.salaryCurrency,
    salaryPeriod: over.salaryPeriod,
    salarySource: over.salarySource,
    postedAt: over.postedAt ?? "2026-09-01",
    source: over.source ?? "greenhouse",
  };
}

function askForm(): HTMLFormElement {
  const input = screen.getByPlaceholderText(en.Jobs.askPlaceholder) as HTMLInputElement;
  return input.form as HTMLFormElement;
}

function renderBrowser(entries: IndexEntry[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <JobsBrowser entries={entries} locale="en" />
    </NextIntlClientProvider>
  );
}

const entries = [
  make({ id: "nl", company: "Dutch Corp", countryIso2: "NL", countryName: "Netherlands", region: "europe", visa: "yes", workMode: "hybrid" }),
  make({ id: "ae", company: "Desert Corp", countryIso2: "AE", visa: "unknown" }),
  make({ id: "director", company: "Acme", seniority: "director", title: "Director of Engineering" }),
  make({
    id: "contract",
    company: "Remote Ltd",
    seniority: "director",
    title: "Director of Engineering",
    roleType: "contract",
    source: "workable",
  }),
];

describe("JobsBrowser ask and saved searches", () => {
  afterEach(cleanup);

  it("renders translated work mode badges on the cards", () => {
    renderBrowser(entries);
    const chipTexts = (text: string) =>
      screen.getAllByText(text).filter((el) => el.closest(".chip"));
    expect(chipTexts("Hybrid")).toHaveLength(1);
    expect(chipTexts("On-site").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("hybrid")).not.toBeInTheDocument();
  });

  it("hides the placeholder visa chip on unknown roles", () => {
    renderBrowser([
      make({ id: "unknown-visa", visa: "unknown" }),
      make({ id: "sponsored", visa: "yes" }),
    ]);
    const visaChips = (text: string) => screen.getAllByText(text).filter((el) => el.closest(".chip"));
    expect(visaChips(en.Jobs.visaUnknown)).toHaveLength(0);
    expect(visaChips(en.Jobs.visaYes).length).toBeGreaterThanOrEqual(1);
  });

  it("marks estimated pay with an asterisk, stated pay without", () => {
    renderBrowser([
      make({ id: "est", salaryMin: 100, salaryMax: 200, salaryCurrency: "USD", salaryPeriod: "annual", salarySource: "estimated" }),
      make({ id: "said", salaryMin: 300, salaryMax: 400, salaryCurrency: "USD", salaryPeriod: "annual", salarySource: "stated" }),
    ]);
    const chips = [...document.querySelectorAll(".chip")].map((el) => el.textContent ?? "");
    const est = chips.find((text) => text.includes("100"));
    const said = chips.find((text) => text.includes("300"));
    expect(est).toMatch(/\*/);
    // the visible parenthetical is gone; the word survives only in sr-only text
    expect(est).not.toMatch(/\(estimated\)/);
    expect(said).not.toMatch(/\*/);
    expect(said).not.toMatch(/estimated/);
    expect(screen.getByText(en.Jobs.estimateNote)).toBeInTheDocument();
  });

  it("marks remote roles that are restricted to a country", () => {
    const worldwide = make({ id: "worldwide", remote: true });
    worldwide.countryIso2 = undefined; // the builder defaults to AE
    renderBrowser([
      make({ id: "restricted", remote: true, countryIso2: "JM", countryName: "Jamaica" }),
      worldwide,
      make({ id: "office", remote: false }),
    ]);
    const chipTexts = [...document.querySelectorAll(".chip")].map((el) => el.textContent?.trim() ?? "");
    expect(chipTexts.filter((x) => x === en.Jobs.locationRestricted)).toHaveLength(1);
  });

  it("clamps card titles to two lines", () => {
    renderBrowser([make({ id: "clamp" })]);
    const heading = screen.getByRole("heading", { name: /VP of Engineering/ });
    expect(heading.className).toContain("line-clamp-2");
  });

  it("renders years of experience as a chip when the role states it", () => {
    renderBrowser([
      make({ id: "range", experienceMin: 8, experienceMax: 12 }),
      make({ id: "floor", experienceMin: 10 }),
      make({ id: "none" }),
    ]);
    expect(screen.getByText("8-12 yrs")).toBeInTheDocument();
    expect(screen.getByText("10+ yrs")).toBeInTheDocument();
    expect(screen.queryByText("yrs")).not.toBeInTheDocument();
  });

  it("keeps the answer panel consistent through suggestion, save and re-apply", () => {
    renderBrowser(entries);
    const question = "Is it possible to get a VP Engineering job in Dubai with visa sponsorship?";

    fireEvent.change(screen.getByPlaceholderText(en.Jobs.askPlaceholder), {
      target: { value: question },
    });
    fireEvent.submit(askForm());
    // zero matches in Dubai with visa; the suggestion relaxes the visa filter
    expect(screen.getByText("Not right now. No roles match that question.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show those roles" }));
    expect(screen.getByText("Yes. 1 role matches")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save this search" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByText("Yes. 1 role matches")).not.toBeInTheDocument();

    // re-applying the saved search restores the on-screen state, and the
    // answer panel agrees with the grid instead of re-answering the question
    fireEvent.click(screen.getByRole("button", { name: question }));
    expect(screen.getByText("Yes. 1 role matches")).toBeInTheDocument();
    expect(screen.getByText("1 role")).toBeInTheDocument();
  });

  it("clears the answer panel when filters change manually", () => {
    renderBrowser(entries);
    fireEvent.change(screen.getByPlaceholderText(en.Jobs.askPlaceholder), {
      target: { value: "Does Acme have a director of engineering role?" },
    });
    fireEvent.submit(askForm());
    expect(screen.getByText("Yes. 1 role matches")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Region"), { target: { value: "europe" } });
    expect(screen.queryByText("Yes. 1 role matches")).not.toBeInTheDocument();
  });

  it("saves and restores the full filter state including role type and source", () => {
    renderBrowser(entries);
    fireEvent.change(screen.getByPlaceholderText(en.Jobs.askPlaceholder), {
      target: { value: "engineering" },
    });
    fireEvent.submit(askForm());
    fireEvent.change(screen.getByLabelText("Role type"), { target: { value: "contract" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "workable" } });

    fireEvent.click(screen.getByRole("button", { name: "Save this search" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("4 roles")).toBeInTheDocument();

    // the saved chip carries the question text, so the query survives re-apply
    fireEvent.click(screen.getByRole("button", { name: "engineering" }));
    expect((screen.getByLabelText("Role type") as HTMLSelectElement).value).toBe("contract");
    expect((screen.getByLabelText("Source") as HTMLSelectElement).value).toBe("workable");
    expect(screen.getByText("1 role")).toBeInTheDocument();
    // the answer panel must agree with the grid, including roleType and source
    expect(screen.getByText("Yes. 1 role matches")).toBeInTheDocument();
  });
});

describe("JobsBrowser search and filters surface", () => {
  afterEach(cleanup);

  it("accepts plain keywords in the ask box without a second search input", () => {
    renderBrowser(entries);
    expect(screen.queryAllByRole("searchbox")).toHaveLength(0);
    fireEvent.change(screen.getByPlaceholderText(en.Jobs.askPlaceholder), {
      target: { value: "Dutch" },
    });
    fireEvent.submit(askForm());
    expect(screen.getByText("1 role")).toBeInTheDocument();
  });

  it("collapses the filter panel behind a toggle that reports active filters", () => {
    renderBrowser(entries);
    const toggle = screen.getByRole("button", { name: "Filters (0)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById("filters-panel");
    expect(panel?.className).toContain("hidden");

    fireEvent.change(screen.getByLabelText("Region"), { target: { value: "europe" } });
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters (1)" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.className).toContain("grid");
    expect(panel?.className).not.toContain("hidden");
  });

  it("labels role types through the catalogs", () => {
    renderBrowser(entries);
    expect(screen.getByRole("option", { name: "Part-time" })).toBeInTheDocument();
    const chips = screen.getAllByText("Contract").filter((el) => el.closest(".chip"));
    expect(chips).toHaveLength(1);
  });

  it("offers the relax-and-suggest path when a re-applied saved search has zero matches", () => {
    renderBrowser(entries);
    const question = "Is it possible to get a VP Engineering job in Japan with visa sponsorship?";
    fireEvent.change(screen.getByPlaceholderText(en.Jobs.askPlaceholder), {
      target: { value: question },
    });
    fireEvent.submit(askForm());
    expect(screen.getByText("Not right now. No roles match that question.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save this search" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.click(screen.getByRole("button", { name: question }));

    // the re-applied answer must still offer the relaxed suggestion
    expect(screen.getByText("Not right now. No roles match that question.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show those roles" })).toBeInTheDocument();
  });

  it("clearing filters returns to page 1", () => {
    const many = Array.from({ length: 26 }, (_, i) => make({ id: `m${i}`, visa: "yes" }));
    renderBrowser(many);
    fireEvent.change(screen.getByLabelText("Visa sponsorship"), { target: { value: "yes" } });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
  });
});
