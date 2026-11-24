import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { JobCard, type JobCardLabels } from "./job-card";
import { ROLE_TYPES, SOURCE_LABELS, type IndexEntry, type Job } from "@/lib/types";
import JobDetailPage from "@/app/[locale]/jobs/[id]/page";
import en from "../messages/en.json";

type Namespace = "Job" | "Jobs";

// the page reads the dataset and the request translations, and a unit test has neither
const dataset = vi.hoisted(() => ({ jobs: [] as Job[] }));
vi.mock("@/lib/data", () => ({
  getAllJobIds: () => dataset.jobs.map((job) => job.id),
  getJobById: (id: string) => dataset.jobs.find((job) => job.id === id) ?? null,
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

  it("reads an old Arbeitnow entry as a source tag and leaves any other old entry plain", () => {
    renderCards(make({ id: "tagged", visa: "yes", source: "arbeitnow" }), make({ id: "read", visa: "yes" }));
    expect(chips().filter((text) => text.startsWith("Sponsors"))).toEqual(["Sponsors (per Arbeitnow)", "Sponsors"]);
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

function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: "j1",
    title: "Director of Engineering",
    company: "Acme",
    applyUrl: "https://careers.acme.com/1",
    sourceUrl: "https://careers.acme.com/1",
    source: "greenhouse",
    sources: ["greenhouse"],
    text: "",
    blocks: [],
    requirements: [],
    location: { raw: "Berlin", region: "europe", remote: false },
    seniority: "director",
    domain: "engineering",
    visa: "unknown",
    workMode: "onsite",
    roleType: "permanent",
    salary: null,
    postedAt: "2026-11-24",
    firstSeen: "2026-11-24",
    updatedAt: "2026-11-24",
    ...over,
  };
}

async function renderPage(id: string) {
  const page = await JobDetailPage({ params: Promise.resolve({ locale: "en", id }) });
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {page}
    </NextIntlClientProvider>
  );
}

describe("job page apply button", () => {
  it('says "Apply via" and the board when the link opens a board', async () => {
    dataset.jobs = [makeJob({ source: "adzuna", sources: ["adzuna"], applyUrl: "https://www.adzuna.sg/details/1" })];
    await renderPage("j1");
    expect(screen.getByRole("link", { name: "Apply via Adzuna" }).getAttribute("href")).toBe(
      "https://www.adzuna.sg/details/1"
    );
  });

  it('keeps "Apply on company site" when the employer hosts the link, whatever the source', async () => {
    dataset.jobs = [makeJob({ source: "arbeitnow", sources: ["arbeitnow"] })];
    await renderPage("j1");
    expect(screen.getByRole("link", { name: "Apply on company site" }).getAttribute("href")).toBe(
      "https://careers.acme.com/1"
    );
    expect(screen.queryByRole("link", { name: /^Apply via/ })).toBeNull();
  });

  it("follows the host of the apply link for a role that two sources list", async () => {
    dataset.jobs = [
      makeJob({ source: "arbeitnow", sources: ["arbeitnow", "adzuna"], applyUrl: "https://www.adzuna.in/details/2" }),
    ];
    await renderPage("j1");
    expect(screen.getByRole("link", { name: "Apply via Adzuna" }).getAttribute("href")).toBe(
      "https://www.adzuna.in/details/2"
    );
  });

  it('keeps the label and the target of the "View original posting" link', async () => {
    const sourceUrl = "https://careers.acme.com/1";
    dataset.jobs = [
      makeJob({ source: "adzuna", sources: ["adzuna"], applyUrl: "https://www.adzuna.sg/details/1", sourceUrl }),
    ];
    await renderPage("j1");
    expect(screen.getByRole("link", { name: "View original posting" }).getAttribute("href")).toBe(sourceUrl);
  });
});
