import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { JobCard, type JobCardLabels } from "./job-card";
import { ROLE_TYPES, SOURCE_LABELS, type IndexEntry } from "@/lib/types";
import en from "../messages/en.json";

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
