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
    fireEvent.change(screen.getByPlaceholderText(en.Jobs.searchPlaceholder), {
      target: { value: "engineering" },
    });
    fireEvent.change(screen.getByLabelText("Role type"), { target: { value: "contract" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "workable" } });

    fireEvent.click(screen.getByRole("button", { name: "Save this search" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("4 roles")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "engineering · contract · Workable" }));
    expect((screen.getByLabelText("Role type") as HTMLSelectElement).value).toBe("contract");
    expect((screen.getByLabelText("Source") as HTMLSelectElement).value).toBe("workable");
    expect(screen.getByText("1 role")).toBeInTheDocument();
  });
});
