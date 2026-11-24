import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { JobCard, type JobCardLabels } from "./job-card";
import { ROLE_TYPES, SOURCE_LABELS, type DatasetStats, type IndexEntry, type Job } from "@/lib/types";
import JobDetailPage from "@/app/[locale]/jobs/[id]/page";
import StatsPage from "@/app/[locale]/stats/page";
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

describe("job page Adzuna mark", () => {
  it("links the Adzuna name of the source line and leaves the other names plain", async () => {
    dataset.jobs = [
      makeJob({ source: "arbeitnow", sources: ["arbeitnow", "adzuna"], sourceHome: "https://www.adzuna.sg" }),
    ];
    await renderPage("j1");
    const mark = screen.getByRole("link", { name: "Adzuna" });
    expect(mark.getAttribute("href")).toBe("https://www.adzuna.sg");
    expect(mark.getAttribute("target")).toBe("_blank");
    expect(mark.getAttribute("rel")).toBe("noopener noreferrer");
    expect(mark.className).toContain("inline-flex");
    expect(mark.className).toContain("min-w-29");
    expect(mark.className).toContain("min-h-6");
    // the word starts its box, so the minimum width leaves its gap after the word and not after the comma
    expect(mark.className).toContain("justify-start");
    expect(mark.closest("p")?.textContent).toBe("Arbeitnow, Adzuna");
    expect(screen.queryByRole("link", { name: "Arbeitnow" })).toBeNull();
  });

  it("links an old dataset record to the origin of its Adzuna apply link", async () => {
    dataset.jobs = [makeJob({ source: "adzuna", sources: ["adzuna"], applyUrl: "https://www.adzuna.sg/details/1" })];
    await renderPage("j1");
    expect(screen.getByRole("link", { name: "Adzuna" }).getAttribute("href")).toBe("https://www.adzuna.sg");
  });

  it("links a record with no Adzuna apply link and no site to the site the Adzuna terms name", async () => {
    dataset.jobs = [makeJob({ source: "adzuna", sources: ["adzuna"] })];
    await renderPage("j1");
    expect(screen.getByRole("link", { name: "Adzuna" }).getAttribute("href")).toBe("https://www.adzuna.co.uk");
  });

  it("renders no mark for a role Adzuna does not list", async () => {
    dataset.jobs = [
      makeJob({ source: "arbeitnow", sources: ["arbeitnow", "himalayas"], applyUrl: "https://www.adzuna.sg/details/1" }),
    ];
    await renderPage("j1");
    expect(screen.queryByRole("link", { name: "Adzuna" })).toBeNull();
    // the button follows the host of the apply link, whatever the sources say
    expect(screen.getByRole("link", { name: "Apply via Adzuna" }).getAttribute("href")).toBe(
      "https://www.adzuna.sg/details/1"
    );
  });
});

describe("job page pay note", () => {
  const estimated = (min: number, max: number) =>
    makeJob({ salary: { min, max, currency: "AED", period: "annual", source: "estimated" } });

  it("shows the band note under a band of two values", async () => {
    dataset.jobs = [estimated(660000, 1080000)];
    await renderPage("j1");
    expect(screen.getByText(/The band lies between the 25th and the 75th percentile/)).toBeInTheDocument();
    expect(screen.queryByText(/The figure is the median annual gross pay/)).toBeNull();
  });

  it("shows the single figure note under a band whose minimum equals its maximum", async () => {
    dataset.jobs = [estimated(675000, 675000)];
    await renderPage("j1");
    expect(screen.getByText(/The figure is the median annual gross pay/)).toBeInTheDocument();
    expect(screen.queryByText(/The band lies between the 25th and the 75th percentile/)).toBeNull();
  });
});

describe("job page last seen date", () => {
  it("says when the source last listed the role, and says nothing for a record of an old dataset", async () => {
    dataset.jobs = [makeJob({ lastSeenAt: "2026-11-24T03:17:00.000Z" })];
    await renderPage("j1");
    expect(screen.getByText("Last listed by the source on 24 Nov 2026.")).toBeInTheDocument();

    cleanup();
    dataset.jobs = [makeJob()];
    await renderPage("j1");
    expect(screen.queryByText(/Last listed by the source/)).toBeNull();
  });
});

describe("job page place label", () => {
  // the line under the title holds the company, the place and the posting date
  const byline = () => screen.getByRole("heading", { level: 1 }).nextElementSibling;

  it("names the region of a remote role restricted to a region and with no country, and not the line of its source", async () => {
    dataset.jobs = [makeJob({ location: { raw: "Anywhere in EMEA", region: "europe", remote: true } })];
    await renderPage("j1");
    expect(byline()).toHaveTextContent("Acme · Europe · Posted 24 Nov 2026");
    expect(screen.queryByText(/Anywhere in EMEA/)).toBeNull();
  });

  it('says "Remote" for a remote role restricted by a list of countries, with no country or region of its own', async () => {
    dataset.jobs = [
      makeJob({
        location: { raw: "Remote (Colombia or Jamaica)", region: null, remote: true, restrictions: ["Colombia", "Jamaica"] },
      }),
    ];
    await renderPage("j1");
    expect(byline()).toHaveTextContent("Acme · Remote · Posted 24 Nov 2026");
    expect(screen.queryByText(/Remote \(Colombia/)).toBeNull();
  });

  it("names the country of a remote variant, and says only Remote for a variant with no country", async () => {
    dataset.jobs = [
      makeJob({
        variants: [
          { countryIso2: "GB", countryName: "United Kingdom", region: "europe", remote: true, applyUrl: "https://careers.acme.com/uk" },
          { region: "remote", remote: true, applyUrl: "https://careers.acme.com/anywhere" },
        ],
      }),
    ];
    await renderPage("j1");
    const section = screen.getByRole("heading", { name: "Also hiring in" }).closest("section");
    expect(section && within(section).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "United Kingdom →",
      "Remote →",
    ]);
  });
});

describe("job page method line", () => {
  const sponsor = "Visa sponsorship is available for exceptional candidates.";
  const refusal = "We do not sponsor visas.";
  const quote = (sentence: string) => `${t("Job.visaEvidencePrefix")} “${sentence}”`;

  it("shows the method line under an affirmation read from the posting", async () => {
    dataset.jobs = [makeJob({ visa: "yes", visaBasis: "posting", visaEvidence: sponsor })];
    await renderPage("j1");
    expect(screen.getByText(quote(sponsor))).toBeInTheDocument();
    expect(screen.getByText(t("Job.visaMethod"))).toBeInTheDocument();
  });

  it("shows no method line under a refusal read from the posting, and keeps its quote", async () => {
    dataset.jobs = [makeJob({ visa: "no", visaBasis: "posting", visaEvidence: refusal })];
    await renderPage("j1");
    expect(screen.getByText(quote(refusal))).toBeInTheDocument();
    expect(screen.queryByText(t("Job.visaMethod"))).toBeNull();
  });
});

describe("job page signal of an old dataset", () => {
  // a dataset that predates the stored basis is read again on the page, the one place that holds the text
  const sponsor = "Visa sponsorship is available for exceptional candidates.";
  const quote = (sentence: string) => `${t("Job.visaEvidencePrefix")} “${sentence}”`;

  it("reads a record with visa words as a posting signal, with its quote", async () => {
    dataset.jobs = [makeJob({ visa: "yes", text: `About the role. ${sponsor} You will lead a team.` })];
    await renderPage("j1");
    expect(screen.getByText(quote(sponsor))).toBeInTheDocument();
    expect(screen.getByText(t("Job.visaMethod"))).toBeInTheDocument();
  });

  it("reads an old Arbeitnow record without visa words as a source tag", async () => {
    dataset.jobs = [makeJob({ visa: "yes", source: "arbeitnow", sources: ["arbeitnow"] })];
    await renderPage("j1");
    expect(screen.getByText("Sponsors (per Arbeitnow)")).toBeInTheDocument();
    expect(screen.queryByText(/Signal read from the posting:/)).toBeNull();
  });

  it("lets the posting win over the tag of an old Arbeitnow record", async () => {
    dataset.jobs = [makeJob({ visa: "yes", source: "arbeitnow", sources: ["arbeitnow"], text: sponsor })];
    await renderPage("j1");
    expect(screen.getByText(quote(sponsor))).toBeInTheDocument();
    expect(screen.queryByText(/per Arbeitnow/)).toBeNull();
  });

  it("gives no quote, no method line and no source name to an old record that nothing supports", async () => {
    dataset.jobs = [makeJob({ visa: "yes" })];
    await renderPage("j1");
    expect(screen.getByText("Sponsors")).toBeInTheDocument();
    expect(screen.queryByText(/Signal read from the posting:/)).toBeNull();
    expect(screen.queryByText(t("Job.visaMethod"))).toBeNull();

    cleanup();
    dataset.jobs = [makeJob({ visa: "no", source: "arbeitnow", sources: ["arbeitnow"] })];
    await renderPage("j1");
    expect(screen.getByText("No sponsorship")).toBeInTheDocument();
    expect(screen.queryByText(/Signal read from the posting:/)).toBeNull();
    expect(screen.queryByText(t("Job.visaMethod"))).toBeNull();
  });
});

describe("stats page carried note", () => {
  const stats = (carried?: DatasetStats["carried"]): DatasetStats => ({
    generatedAt: "2026-11-24T03:17:00.000Z",
    total: 1108,
    bySource: {},
    byRegion: {},
    byVisa: {},
    countries: 12,
    ...(carried ? { carried } : {}),
  });

  async function renderStats() {
    const page = await StatsPage({ params: Promise.resolve({ locale: "en" }) });
    return render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {page}
      </NextIntlClientProvider>
    );
  }

  it("counts the roles kept from the previous refresh after a source failed to answer", async () => {
    dataset.stats = stats({ total: 5, bySource: { adzuna: 5 } });
    await renderStats();
    expect(
      screen.getByText("5 roles are kept from the previous refresh after a source failed to answer.")
    ).toBeInTheDocument();
  });

  it("shows no line for a dataset that kept no role, and for one written before the count existed", async () => {
    dataset.stats = stats({ total: 0, bySource: {} });
    await renderStats();
    expect(screen.queryByText(/kept from the previous refresh/)).toBeNull();

    cleanup();
    dataset.stats = stats();
    await renderStats();
    expect(screen.queryByText(/kept from the previous refresh/)).toBeNull();
  });
});
