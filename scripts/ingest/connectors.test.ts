import { describe, expect, it } from "vitest";
import greenhouseFixture from "./__fixtures__/greenhouse.json";
import workableFixture from "./__fixtures__/workable.json";
import arbeitnowFixture from "./__fixtures__/arbeitnow.json";
import jobicyFixture from "./__fixtures__/jobicy.json";
import { greenhouseConnector } from "./connectors/greenhouse";
import { workableConnector } from "./connectors/workable";
import { arbeitnowConnector } from "./connectors/arbeitnow";
import { jobicyConnector } from "./connectors/jobicy";

function stubFetch(payloadByHost: Record<string, unknown>) {
  return async (url: string) => {
    const host = new URL(url).host;
    const payload = payloadByHost[host];
    if (!payload) throw new Error(`no stub for ${url}`);
    return payload;
  };
}

describe("greenhouse connector", () => {
  it("maps board jobs to raw jobs", async () => {
    const connector = greenhouseConnector(
      { fetchJson: stubFetch({ "boards-api.greenhouse.io": greenhouseFixture }) },
      { tokens: ["stripe"] }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(5);
    expect(jobs[0]).toMatchObject({
      source: "greenhouse",
      company: "Stripe",
      applyUrl: expect.stringContaining("https://"),
      locationRaw: "Dublin",
    });
    expect(jobs[0].externalId).toBe("gh-8172508");
  });

  it("continues past a failing board", async () => {
    let calls = 0;
    const connector = greenhouseConnector(
      {
        fetchJson: async () => {
          calls += 1;
          if (calls === 1) throw new Error("HTTP 404");
          return greenhouseFixture;
        },
      },
      { tokens: ["deadboard", "stripe"] }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(5);
  });
});

import leverFixture from "./__fixtures__/lever.json";
import { leverConnector } from "./connectors/lever";

describe("lever connector", () => {
  it("maps postings to raw jobs with a prettified company name", async () => {
    const connector = leverConnector(
      { fetchJson: stubFetch({ "api.lever.co": leverFixture }) },
      { tokens: ["netomi"] }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(2);
    expect(jobs[0]).toMatchObject({
      source: "lever",
      company: "Netomi",
      title: expect.stringContaining(""),
      applyUrl: expect.stringContaining("https://"),
      sourceUrl: expect.stringContaining("jobs.lever.co"),
      remoteHint: true,
    });
    expect(jobs[0].postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(jobs[0].employmentHint).toBe("Full-time");
  });

  it("continues past a failing board and accepts the hits envelope shape", async () => {
    let calls = 0;
    const connector = leverConnector(
      {
        fetchJson: async () => {
          calls += 1;
          if (calls === 1) throw new Error("HTTP 404");
          return { hits: leverFixture };
        },
      },
      { tokens: ["deadboard", "netomi"] }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(2);
  });
});

describe("workable connector", () => {
  it("maps search results with company, logo and structured location", async () => {
    const connector = workableConnector(
      { fetchJson: stubFetch({ "jobs.workable.com": workableFixture }) },
      { queries: ["CTO"], locations: ["United Arab Emirates"] }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(2);
    const cto = jobs.find((j) => j.title.includes("CTO"));
    expect(cto).toMatchObject({
      source: "workable",
      company: "Flatgigs",
      companyLogoUrl: expect.stringContaining("workablehr"),
      locationRaw: "Dubai, United Arab Emirates",
    });
  });

  it("deduplicates the same job returned by overlapping queries", async () => {
    const connector = workableConnector(
      { fetchJson: stubFetch({ "jobs.workable.com": workableFixture }) },
      { queries: ["CTO", "Chief Technology Officer"], locations: ["United Arab Emirates"] }
    );
    const jobs = await connector.run();
    const ids = jobs.map((j) => j.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("arbeitnow visa cross-reference", () => {
  it("marks jobs whose slug appears in the visa-filtered feed", async () => {
    const normal = { data: arbeitnowFixture.data ?? arbeitnowFixture };
    const visaFeed = { data: [(arbeitnowFixture.data ?? arbeitnowFixture)[0]] };
    const connector = arbeitnowConnector(
      {
        fetchJson: async (url: string) =>
          url.includes("visa_sponsorship=true") ? visaFeed : normal,
      },
      { pages: 1 }
    );
    const jobs = await connector.run();
    const flagged = jobs.filter((j) => j.visaHint === true);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].externalId).toBe(`an-${(arbeitnowFixture.data ?? arbeitnowFixture)[0].slug}`);
  });

  it("keeps running without hints when the filtered feed fails", async () => {
    const connector = arbeitnowConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("visa_sponsorship=true")) throw new Error("HTTP 500");
          return { data: arbeitnowFixture.data ?? arbeitnowFixture };
        },
      },
      { pages: 1 }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.visaHint !== true)).toBe(true);
  });
});

describe("arbeitnow connector", () => {
  it("converts unix timestamps to ISO dates", async () => {
    const connector = arbeitnowConnector(
      { fetchJson: stubFetch({ "www.arbeitnow.com": arbeitnowFixture }) },
      { pages: 1 }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(3);
    expect(jobs[0].postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(jobs[0].source).toBe("arbeitnow");
  });
});

describe("jobicy connector", () => {
  it("maps structured salary and geo fields", async () => {
    const connector = jobicyConnector(
      { fetchJson: stubFetch({ "jobicy.com": jobicyFixture }) },
      { count: 2 }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(2);
    expect(jobs[0].salaryHint).toMatchObject({ currency: "USD", period: "annual" });
    expect(jobs[0].locationRaw).toBe("USA");
  });
});
