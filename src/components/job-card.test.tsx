import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { JobCard, type JobCardLabels } from "./job-card";
import { ROLE_TYPES, SOURCE_LABELS, type DatasetStats, type IndexEntry, type Job } from "@/lib/types";
import en from "../messages/en.json";

type Namespace = "Job" | "Jobs" | "Stats";

// the pages read the dataset and the request translations, and a unit test has neither
const dataset = vi.hoisted(() => ({ jobs: [] as Job[], stats: null as DatasetStats | null }));
vi.mock("@/lib/data", () => ({
  getAllJobIds: () => dataset.jobs.map((job) => job.id),
  getJobById: (id: string) => dataset.jobs.find((job) => job.id === id) ?? null,
  getStats: () => dataset.stats,
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async (namespace: Namespace | { namespace: Namespace }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: typeof namespace === "string" ? namespace : namespace.namespace,
    }),
}));

const t = createTranslator({ locale: "en", messages: en });

/** A remote role with no country, region or restriction list. */
const anywhere = { remote: true, countryIso2: undefined, countryName: undefined, region: null };

function make(over: Partial<IndexEntry> = {}): IndexEntry {
  return {
    id: "j1",
    title: "Director of Engineering",
    company: "Acme",
    seniority: "director",
    domain: "engineering",
    countryIso2: "DE",
    countryName: "Germany",
    region: "europe",
    remote: false,
    visa: "unknown",
    workMode: "onsite",
    roleType: "permanent",
    postedAt: "2026-11-24",
    source: "greenhouse",
    ...over,
  };
}

// the real catalogs, so a missing key or a wrong wording fails here and not in the browser
const labels: JobCardLabels = {
  remoteWorldwide: t("Jobs.remoteWorldwide"),
  workModeLabels: { remote: t("Jobs.remote"), hybrid: t("Jobs.hybrid"), onsite: t("Jobs.onsite") },
  hybridDays: (days) => t("Job.hybridDays", { days }),
  salaryStated: t("Jobs.salaryStated"),
  salaryEstimated: t("Jobs.salaryEstimated"),
  visaYes: t("Jobs.visaYes"),
  visaNo: t("Jobs.visaNo"),
  visaUnknown: t("Jobs.visaUnknown"),
  perYear: t("Jobs.perYear"),
  perMonth: t("Jobs.perMonth"),
  experience: (min, max) => (max !== undefined ? t("Jobs.experienceYears", { min, max }) : t("Jobs.experienceYearsPlus", { min })),
  plusPlaces: (n) => t("Jobs.plusPlaces", { n }),
  locationRestricted: t("Jobs.locationRestricted"),
  worldwideRemote: t("Jobs.worldwideRemote"),
  posted: (date) => t("Job.posted", { date }),
  roleTypeLabels: Object.fromEntries(ROLE_TYPES.map((type) => [type, t(`RoleType.${type}`)])),
  sourceLabels: Object.fromEntries(Object.entries(SOURCE_LABELS)),
  visaYesBySource: (source) => t("Jobs.visaYesBySource", { source }),
  relocationYes: t("Jobs.relocationYes"),
};

function renderCards(...jobs: IndexEntry[]): void {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} labels={labels} />
      ))}
    </NextIntlClientProvider>
  );
}

function chips(): string[] {
  return [...document.querySelectorAll(".chip")].map((el) => el.textContent ?? "");
}

afterEach(cleanup);

describe("JobCard visa chip", () => {
  it('says "Sponsors (per Arbeitnow)" when a source tag carries the signal', () => {
    renderCards(make({ visa: "yes", visaBasis: "source", source: "arbeitnow" }));
    expect(chips()).toContain("Sponsors (per Arbeitnow)");
  });

  it('says "Sponsors" when the posting carries the signal', () => {
    renderCards(make({ visa: "yes", visaBasis: "posting" }));
    expect(chips()).toContain("Sponsors");
  });

  it("keeps the refusal chip for a posting refusal", () => {
    renderCards(make({ visa: "no", visaBasis: "posting" }));
    expect(chips()).toContain("No sponsorship");
  });

  it("says only Sponsors for an entry of an old dataset, whatever its source, because a card holds no text to read", () => {
    renderCards(make({ id: "tagged", visa: "yes", source: "arbeitnow" }), make({ id: "read", visa: "yes" }));
    expect(chips().filter((text) => text.startsWith("Sponsors"))).toEqual(["Sponsors", "Sponsors"]);
  });
});

describe("JobCard relocation chip", () => {
  it('shows "Relocation support" when the role offers relocation', () => {
    renderCards(make({ visa: "yes", visaBasis: "posting", relocation: "yes" }));
    expect(chips()).toContain("Relocation support");
  });

  it("shows no relocation chip for a refusal or a role that says nothing", () => {
    renderCards(make({ id: "refused", relocation: "no" }), make({ id: "silent" }));
    expect(chips()).not.toContain("Relocation support");
  });
});

describe("JobCard remote scope", () => {
  it('marks a remote role restricted to a region "Location restricted" and never worldwide', () => {
    renderCards(make({ ...anywhere, region: "europe" }));
    expect(chips()).toContain("Location restricted");
    expect(chips()).not.toContain("Worldwide remote");
    expect(document.body.textContent).not.toContain("Remote, worldwide");
  });

  it('marks a remote role restricted by a list of countries "Location restricted"', () => {
    renderCards(make({ ...anywhere, locationRestrictions: ["Colombia", "Jamaica"] }));
    expect(chips()).toContain("Location restricted");
    expect(chips()).not.toContain("Worldwide remote");
    expect(document.body.textContent).not.toContain("Remote, worldwide");
  });

  it('says "Worldwide remote" for a remote role with no country, region or restrictions', () => {
    renderCards(make(anywhere));
    expect(chips()).toContain("Worldwide remote");
    expect(chips()).not.toContain("Location restricted");
  });
});

describe("JobCard place label", () => {
  it("names the region of a remote role restricted to a region and with no country, and not the region id", () => {
    renderCards(make({ ...anywhere, region: "europe" }));
    expect(screen.getByText("Acme · Europe")).toBeInTheDocument();
  });

  it('says "Remote" for a remote role restricted by a list of countries, with no country or region of its own', () => {
    renderCards(make({ ...anywhere, locationRestrictions: ["Colombia", "Jamaica"] }));
    expect(screen.getByText("Acme · Remote")).toBeInTheDocument();
  });
});

describe("JobCard Adzuna mark", () => {
  it("renders the Adzuna chip as the attribution link", () => {
    renderCards(make({ source: "adzuna", sourceHome: "https://www.adzuna.sg" }));
    const mark = screen.getByRole("link", { name: "Adzuna" });
    expect(mark.getAttribute("href")).toBe("https://www.adzuna.sg");
    expect(mark.getAttribute("target")).toBe("_blank");
    expect(mark.getAttribute("rel")).toBe("noopener noreferrer");
    expect(mark.className).toContain("inline-flex");
    expect(mark.className).toContain("min-w-29");
    expect(mark.className).toContain("min-h-6");
    expect(chips()).toContain("Adzuna");
  });

  it("links an entry of an old dataset to the site the Adzuna terms name", () => {
    renderCards(make({ source: "adzuna" }));
    expect(screen.getByRole("link", { name: "Adzuna" }).getAttribute("href")).toBe("https://www.adzuna.co.uk");
  });

  it("keeps the source chip of every other source as plain text", () => {
    renderCards(make());
    expect(screen.queryByRole("link", { name: "Greenhouse" })).toBeNull();
    expect(chips()).toContain("Greenhouse");
  });

  it("shows the mark next to the source chip of a role Adzuna lists as a second source", () => {
    renderCards(make({ sources: ["greenhouse", "adzuna"], sourceHome: "https://www.adzuna.sg" }));
    expect(screen.getByRole("link", { name: "Adzuna" }).getAttribute("href")).toBe("https://www.adzuna.sg");
    expect(chips()).toContain("Greenhouse");
  });

  it("shows no mark for a role that no Adzuna source lists, and for an entry of an old dataset", () => {
    renderCards(make({ id: "listed", sources: ["greenhouse", "himalayas"] }), make({ id: "old" }));
    expect(screen.queryByRole("link", { name: "Adzuna" })).toBeNull();
  });
});
