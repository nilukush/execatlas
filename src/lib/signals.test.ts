import { describe, expect, it } from "vitest";
import { remoteScope, signalView } from "./signals";
import type { IndexEntry, Job } from "./types";

const NOW = "2026-11-24T00:00:00.000Z";
const SPONSOR = "Visa sponsorship is available for exceptional candidates.";
const REFUSAL = "We do not sponsor visas.";

/** A remote role with no country, region or restriction list. */
const anywhere = { remote: true, countryIso2: undefined, countryName: undefined, region: null };

function makeEntry(over: Partial<IndexEntry> = {}): IndexEntry {
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
    postedAt: NOW,
    source: "greenhouse",
    ...over,
  };
}

/** The shape of a job in a dataset that predates the stored basis, evidence and date. */
function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: "j1",
    title: "Director of Engineering",
    company: "Acme",
    applyUrl: "https://acme.example/jobs/1",
    sourceUrl: "https://acme.example/jobs/1",
    source: "greenhouse",
    sources: ["greenhouse"],
    text: "We are hiring a Director of Engineering.",
    blocks: [],
    requirements: [],
    location: { countryIso2: "DE", countryName: "Germany", region: "europe", remote: false, raw: "Berlin" },
    seniority: "director",
    domain: "engineering",
    visa: "unknown",
    workMode: "onsite",
    roleType: "permanent",
    salary: null,
    postedAt: NOW,
    firstSeen: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("signalView", () => {
  it("reads a stored posting signal with its quote", () => {
    const view = signalView(makeJob({ visa: "yes", visaBasis: "posting", visaEvidence: SPONSOR }));
    expect(view).toEqual({ basis: "posting", evidence: SPONSOR });
  });

  it("reads a stored refusal the same way", () => {
    const view = signalView(makeJob({ visa: "no", visaBasis: "posting", visaEvidence: REFUSAL, text: REFUSAL }));
    expect(view).toEqual({ basis: "posting", evidence: REFUSAL });
  });

  it("reads a stored source tag, which stands on no quote", () => {
    const view = signalView(
      makeJob({ visa: "yes", source: "arbeitnow", sources: ["arbeitnow"], visaBasis: "source", visaEvidence: null, visaDeclaredAt: NOW })
    );
    expect(view).toEqual({ basis: "source", evidence: null });
  });

  it("reads an old record with visa words as a posting signal", () => {
    const view = signalView(makeJob({ visa: "yes", text: `About the role. ${SPONSOR} You will lead a team.` }));
    expect(view.basis).toBe("posting");
    expect(view.evidence).toBe(SPONSOR);
  });

  it("reads an old Arbeitnow record without visa words as a source tag", () => {
    const view = signalView(makeJob({ visa: "yes", source: "arbeitnow", sources: ["arbeitnow"] }));
    expect(view).toEqual({ basis: "source", evidence: null });
  });

  it("lets the posting win over the tag of an old Arbeitnow record", () => {
    const view = signalView(makeJob({ visa: "yes", source: "arbeitnow", sources: ["arbeitnow"], text: SPONSOR }));
    expect(view.basis).toBe("posting");
  });

  it("gives no basis to an old record that nothing supports", () => {
    expect(signalView(makeJob({ visa: "yes" })).basis).toBeUndefined();
    expect(signalView(makeJob({ visa: "no", source: "arbeitnow", sources: ["arbeitnow"] })).basis).toBeUndefined();
  });

  it("reads a card entry, which carries no text, by its stored basis", () => {
    expect(signalView(makeEntry({ visa: "yes", visaBasis: "posting" })).basis).toBe("posting");
    expect(signalView(makeEntry({ visa: "yes", visaBasis: "source", source: "arbeitnow" })).basis).toBe("source");
  });

  it("reads an old Arbeitnow card entry as a source tag and leaves any other old entry unsupported", () => {
    expect(signalView(makeEntry({ visa: "yes", source: "arbeitnow" })).basis).toBe("source");
    expect(signalView(makeEntry({ visa: "yes" })).basis).toBeUndefined();
  });
});

describe("remoteScope", () => {
  it("calls a remote role with no country, region or restrictions worldwide", () => {
    expect(remoteScope(makeEntry(anywhere))).toBe("worldwide");
  });

  it("calls a remote role with a region restricted", () => {
    expect(remoteScope(makeEntry({ ...anywhere, region: "europe" }))).toBe("restricted");
  });

  it("calls a remote role with a country restricted", () => {
    expect(remoteScope(makeEntry({ remote: true }))).toBe("restricted");
  });

  it("calls a remote role with a restrictions list restricted", () => {
    expect(remoteScope(makeEntry({ ...anywhere, locationRestrictions: ["Colombia", "Jamaica"] }))).toBe("restricted");
  });

  it("counts an empty restrictions list as a list", () => {
    expect(remoteScope(makeEntry({ ...anywhere, locationRestrictions: [] }))).toBe("restricted");
  });

  it("gives no scope to a role that is not remote", () => {
    expect(remoteScope(makeEntry({ countryIso2: undefined, countryName: undefined, region: null }))).toBeNull();
  });
});
