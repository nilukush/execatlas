import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { DatasetStats, Job } from "@/lib/types";
import JobDetailPage from "./page";
import en from "@/messages/en.json";

type Namespace = "Job" | "Jobs";

// the page reads the dataset and the request translations, and a unit test has neither
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

afterEach(cleanup);

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

  it("prints the region once in the location card of a remote role with no country", async () => {
    dataset.jobs = [makeJob({ location: { raw: "Anywhere in EMEA", region: "europe", remote: true } })];
    await renderPage("j1");
    const card = screen.getByRole("heading", { name: "Location" }).parentElement;
    // the place line already names the region, so the line under it would repeat it
    expect(card?.textContent?.match(/Europe/g) ?? []).toHaveLength(1);
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
