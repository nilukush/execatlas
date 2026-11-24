import { describe, expect, it, vi } from "vitest";
import adzunaFixture from "./__fixtures__/adzuna.json";
import arbeitnowFixture from "./__fixtures__/arbeitnow.json";
import ashbyFixture from "./__fixtures__/ashby.json";
import greenhouseFixture from "./__fixtures__/greenhouse.json";
import himalayasFixture from "./__fixtures__/himalayas.json";
import jobicyFixture from "./__fixtures__/jobicy.json";
import leverFixture from "./__fixtures__/lever.json";
import workableFixture from "./__fixtures__/workable.json";
import { adzunaConnector } from "./connectors/adzuna";
import { arbeitnowConnector } from "./connectors/arbeitnow";
import { ashbyConnector } from "./connectors/ashby";
import { greenhouseConnector } from "./connectors/greenhouse";
import { himalayasConnector } from "./connectors/himalayas";
import { jobicyConnector } from "./connectors/jobicy";
import { leverConnector } from "./connectors/lever";
import { workableConnector } from "./connectors/workable";
import { ADZUNA_COUNTRIES } from "./config";
import type { FeedFailure, FetchDeps } from "./http";

function stubFetch(payloadByHost: Record<string, unknown>) {
  return async (url: string) => {
    const host = new URL(url).host;
    const payload = payloadByHost[host];
    if (!payload) throw new Error(`no stub for ${url}`);
    return payload;
  };
}

// the night after the Himalayas fixture was published: the run time an expiry is judged against
const HIMALAYAS_RUN = new Date((himalayasFixture[0].pubDate + 24 * 60 * 60) * 1000).toISOString();

// a plain array: vitest clears mock call history before each test
function recorder() {
  const reported: FeedFailure[] = [];
  return {
    reported,
    reportFailure: (failure: FeedFailure) => {
      reported.push(failure);
    },
  };
}

// a failure as cachedFetchJson throws it: the status and the transient flag ride on the error
const rateLimited = () => Object.assign(new Error("HTTP 429"), { status: 429, transient: true });
const goneForGood = () => Object.assign(new Error("HTTP 404"), { status: 404, transient: false });

function expectOneFailure(reported: FeedFailure[], source: FeedFailure["source"], unit: string) {
  expect(reported).toEqual([{ source, unit, status: 429, transient: true, message: "HTTP 429" }]);
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

describe("adzuna connector", () => {
  it("maps search results with the queried country prefixed to the location", async () => {
    const connector = adzunaConnector(
      { fetchJson: async () => ({ results: adzunaFixture }) },
      { appId: "id", appKey: "key", countries: ["gb"], queries: ["engineering director"], pages: 1 }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(2);
    expect(jobs[0]).toMatchObject({
      source: "adzuna",
      company: "Odevo UK",
      locationRaw: expect.stringMatching(/^United Kingdom/),
      applyUrl: expect.stringContaining("https://"),
      postedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      salaryHint: null,
    });
  });

  it("skips the source entirely without credentials and keeps going on a country failure", async () => {
    const noCreds = adzunaConnector(
      { fetchJson: async () => { throw new Error("must not fetch"); } },
      { appId: "", appKey: "", countries: ["gb"], queries: ["x"], pages: 1 }
    );
    expect(await noCreds.run()).toEqual([]);

    let calls = 0;
    const partial = adzunaConnector(
      {
        fetchJson: async () => {
          calls += 1;
          if (calls === 1) throw new Error("HTTP 403 quota");
          return { results: adzunaFixture };
        },
      },
      { appId: "id", appKey: "key", countries: ["de", "gb"], queries: ["q"], pages: 1 }
    );
    const jobs = await partial.run();
    expect(jobs.length).toBe(2);
    expect(jobs[0].locationRaw.startsWith("United Kingdom")).toBe(true);
  });

  it("sends credentials and pagination on every request", async () => {
    const urls: string[] = [];
    const connector = adzunaConnector(
      {
        fetchJson: async (url: string) => {
          urls.push(url);
          return { results: [] };
        },
      },
      { appId: "myid", appKey: "mykey", countries: ["gb", "in"], queries: ["a", "b"], pages: 1 }
    );
    await connector.run();
    expect(urls).toHaveLength(4);
    expect(urls.every((u) => u.includes("app_id=myid") && u.includes("app_key=mykey"))).toBe(true);
  });
});

describe("himalayas connector", () => {
  it("maps search results to raw remote jobs with stated salaries", async () => {
    const connector = himalayasConnector(
      { fetchJson: async () => ({ jobs: himalayasFixture }) },
      { pages: 1, queries: ["engineering"], now: HIMALAYAS_RUN }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(2);
    expect(jobs[0]).toMatchObject({
      source: "himalayas",
      remoteHint: true,
      employmentHint: expect.any(String),
    });
    expect(jobs[0].postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(jobs[0].salaryHint).toEqual({
      min: himalayasFixture[0].minSalary,
      max: himalayasFixture[0].maxSalary,
      currency: himalayasFixture[0].currency,
      period: "annual",
    });
    // the guid is a URL; the id must use its unique tail, not the scheme
    expect(jobs[0].externalId).not.toContain("https");
  });

  it("passes the location restrictions of a remote role", async () => {
    const first = himalayasFixture[0];
    const restricted = {
      ...first,
      guid: `${first.guid}-lead`,
      applicationLink: `${first.applicationLink}-lead`,
      locationRestrictions: ["Colombia", "Jamaica"],
    };
    const unrestricted = { ...himalayasFixture[1], locationRestrictions: undefined };
    const connector = himalayasConnector(
      { fetchJson: async () => ({ jobs: [restricted, unrestricted] }) },
      { pages: 1, queries: ["engineering"], now: HIMALAYAS_RUN }
    );
    const jobs = await connector.run();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      locationRestrictions: ["Colombia", "Jamaica"],
      locationRaw: "Remote, Colombia, Jamaica",
    });
    expect(jobs[1]).toMatchObject({ locationRestrictions: [], locationRaw: "Remote" });
  });

  it("queries keyword and seniority search feeds, not the firehose", async () => {
    const urls: string[] = [];
    const connector = himalayasConnector(
      {
        fetchJson: async (url: string) => {
          urls.push(url);
          return { jobs: [] };
        },
      },
      { pages: 1, queries: ["engineering", "product"], now: HIMALAYAS_RUN }
    );
    await connector.run();
    expect(urls.some((u) => u.includes("seniority=Director") && u.includes("q=engineering"))).toBe(true);
    expect(urls.some((u) => u.includes("seniority=Executive") && u.includes("q=product"))).toBe(true);
    expect(urls.every((u) => u.includes("/search"))).toBe(true);
    expect(urls).toHaveLength(4);
  });

  it("pages with the page parameter and stops on feed exhaustion, tolerating failure", async () => {
    const calls: string[] = [];
    let failed = false;
    const connector = himalayasConnector(
      {
        fetchJson: async (url: string) => {
          calls.push(url);
          if (!failed) {
            failed = true;
            throw new Error("HTTP 429");
          }
          const page = new URL(url).searchParams.get("page");
          if (page === "1") {
            return { jobs: himalayasFixture, offset: 0, totalCount: himalayasFixture.length + 5 };
          }
          return { jobs: himalayasFixture.slice(0, 1), offset: himalayasFixture.length, totalCount: himalayasFixture.length + 5 };
        },
      },
      { pages: 3, queries: ["engineering"], now: HIMALAYAS_RUN }
    );
    const jobs = await connector.run();
    // first feed call failed once then paged to exhaustion; seniority=Executive feeds also ran
    expect(calls.some((u) => u.includes("page=1"))).toBe(true);
    expect(calls.some((u) => u.includes("page=2"))).toBe(true);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs.every((j) => !j.externalId.includes("https"))).toBe(true);
  });

  it("maps the expiry date to an ISO stamp", async () => {
    const connector = himalayasConnector(
      { fetchJson: async () => ({ jobs: himalayasFixture }) },
      { pages: 1, queries: ["engineering"], now: HIMALAYAS_RUN }
    );
    const jobs = await connector.run();
    expect(jobs[0].expiresAt).toBe(new Date(himalayasFixture[0].expiryDate * 1000).toISOString());
    expect(jobs[0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("skips a job whose expiry lies before the run time", async () => {
    const first = himalayasFixture[0];
    // dated one hour after it was published, so the night after is past its expiry
    const expired = {
      ...first,
      guid: `${first.guid}-expired`,
      applicationLink: `${first.applicationLink}-expired`,
      expiryDate: first.pubDate + 60 * 60,
    };
    const connector = himalayasConnector(
      { fetchJson: async () => ({ jobs: [expired, himalayasFixture[1]] }) },
      { pages: 1, queries: ["engineering"], now: HIMALAYAS_RUN }
    );
    const jobs = await connector.run();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe(`hml-${himalayasFixture[1].guid.split("/").pop()}`);
  });

  it("judges an expiry by the parsed times, not by the spelling of the two stamps", async () => {
    const first = himalayasFixture[0];
    const dated = (suffix: string, expiresAt: string) => ({
      ...first,
      guid: `${first.guid}-${suffix}`,
      applicationLink: `${first.applicationLink}-${suffix}`,
      expiryDate: Date.parse(expiresAt) / 1000,
    });
    // a run time spelled with an offset: 10:00 UTC, two hours after the first expiry and two hours before the second
    const now = "2026-10-01T06:00:00-04:00";
    const connector = himalayasConnector(
      {
        fetchJson: async () => ({ jobs: [dated("gone", "2026-10-01T08:00:00.000Z"), dated("live", "2026-10-01T12:00:00.000Z")] }),
      },
      { pages: 1, queries: ["engineering"], now }
    );
    const jobs = await connector.run();
    expect(jobs.map((j) => j.externalId)).toEqual([`hml-${first.guid.split("/").pop()}-live`]);
  });

  it("keeps a job the API dates with no expiry", async () => {
    const first = himalayasFixture[0];
    // dated one hour after it was published, so the night after is past its expiry
    const expired = {
      ...first,
      guid: `${first.guid}-expired`,
      applicationLink: `${first.applicationLink}-expired`,
      expiryDate: first.pubDate + 60 * 60,
    };
    // a null stamp and an absent one both date no expiry
    for (const expiryDate of [null, undefined]) {
      const undated = { ...first, expiryDate };
      const connector = himalayasConnector(
        { fetchJson: async () => ({ jobs: [undated, expired] }) },
        { pages: 1, queries: ["engineering"], now: HIMALAYAS_RUN }
      );
      const jobs = await connector.run();
      // only the undated job is left: the expired one beside it is dropped
      expect(jobs).toHaveLength(1);
      expect(jobs[0].externalId).toBe(`hml-${first.guid.split("/").pop()}`);
      expect(jobs[0]).not.toHaveProperty("expiresAt");
    }
  });
});

describe("ashby connector", () => {
  it("maps job-board postings to raw jobs with normalized employment hints", async () => {
    const connector = ashbyConnector(
      { fetchJson: stubFetch({ "api.ashbyhq.com": { jobs: ashbyFixture } }) },
      { tokens: ["docker"], names: { docker: "Docker" } }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toMatchObject({
      source: "ashby",
      company: "Docker",
      remoteHint: true,
      employmentHint: "Full-time",
    });
    expect(jobs[0].postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(jobs[0].applyUrl).toContain("https://");
  });

  it("continues past a failing board", async () => {
    let calls = 0;
    const connector = ashbyConnector(
      {
        fetchJson: async () => {
          calls += 1;
          if (calls === 1) throw new Error("HTTP 404");
          return { jobs: ashbyFixture };
        },
      },
      { tokens: ["deadboard", "docker"], names: {} }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBe(1);
  });
});

describe("jobicy tag queries", () => {
  it("fetches tag-searched jobs and dedupes against the plain feed", async () => {
    const plain = { jobs: jobicyFixture.jobs ?? jobicyFixture };
    const first = (jobicyFixture.jobs ?? jobicyFixture)[0];
    const taggedHit = { ...first, id: 99901, jobTitle: "Head of Engineering" };
    const connector = jobicyConnector(
      {
        fetchJson: async (url: string) =>
          url.includes("tag=") ? { jobs: [taggedHit] } : plain,
      },
      { count: 5, tags: ["head of engineering"] }
    );
    const jobs = await connector.run();
    expect(jobs.some((j) => j.externalId === "jc-99901")).toBe(true);
    const ids = jobs.map((j) => j.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the plain feed when a tag query fails", async () => {
    const plain = { jobs: jobicyFixture.jobs ?? jobicyFixture };
    const connector = jobicyConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("tag=")) throw new Error("HTTP 500");
          return plain;
        },
      },
      { count: 5, tags: ["cto"] }
    );
    const jobs = await connector.run();
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => !j.externalId.includes("999"))).toBe(true);
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

describe("adzuna query window", () => {
  it("caps the age of every request at the source", async () => {
    const urls: string[] = [];
    const connector = adzunaConnector(
      {
        fetchJson: async (url: string) => {
          urls.push(url);
          return { results: [] };
        },
      },
      { appId: "id", appKey: "key", countries: ["gb", "in"], queries: ["a", "b"], pages: 1 }
    );
    await connector.run();
    expect(urls.map((u) => new URL(u).searchParams.get("max_days_old"))).toEqual(["365", "365", "365", "365"]);
  });

  it("queries Mexico in place of Brazil, under a name the connector knows", async () => {
    expect(ADZUNA_COUNTRIES).toContain("mx");
    expect(ADZUNA_COUNTRIES).not.toContain("br");
    const urls: string[] = [];
    const connector = adzunaConnector(
      {
        fetchJson: async (url: string) => {
          urls.push(url);
          return { results: [] };
        },
      },
      { appId: "id", appKey: "key", countries: ADZUNA_COUNTRIES, queries: ["engineering director"], pages: 1 }
    );
    await connector.run();
    // a country without an English name is skipped before any request
    expect(urls).toHaveLength(ADZUNA_COUNTRIES.length);
    expect(urls.some((u) => u.includes("/jobs/mx/search/"))).toBe(true);
  });
});

describe("adzuna attribution home", () => {
  it("stores the Adzuna site of each apply link without its port, and nothing off Adzuna or for a link that does not parse", async () => {
    const [first] = adzunaFixture;
    const link = (id: string, redirect_url: string) => ({ ...first, id, redirect_url });
    const connector = adzunaConnector(
      {
        fetchJson: async () => ({
          results: [
            link("home-1", "https://www.adzuna.com/landing-page/ads/1"),
            link("home-2", "not a url"),
            link("home-3", "https://www.adzuna.de:8443/landing-page/ads/3"),
            link("home-4", "https://employer.example/jobs/4"),
          ],
        }),
      },
      { appId: "id", appKey: "key", countries: ["gb"], queries: ["engineering director"], pages: 1 }
    );
    const jobs = await connector.run();
    expect(jobs.map((j) => [j.externalId, j.sourceHome])).toEqual([
      ["ad-home-1", "https://www.adzuna.com"],
      ["ad-home-2", undefined],
      ["ad-home-3", "https://www.adzuna.de"],
      ["ad-home-4", undefined],
    ]);
  });
});

describe("adzuna failed feed", () => {
  it("reports a failed country and query and tags each job with them", async () => {
    const { reported, reportFailure } = recorder();
    const connector = adzunaConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("/jobs/de/")) throw rateLimited();
          return { results: adzunaFixture };
        },
        reportFailure,
      },
      { appId: "id", appKey: "key", countries: ["de", "gb"], queries: ["engineering director"], pages: 1 }
    );
    const jobs = await connector.run();
    expectOneFailure(reported, "adzuna", "de/engineering director");
    expect(jobs.length).toBe(2);
    expect(jobs.every((j) => j.feedUnit === "gb/engineering director")).toBe(true);
  });

  it("reports a night without credentials as a transient failure of the whole source, and asks nothing", async () => {
    const { reported, reportFailure } = recorder();
    const asked: string[] = [];
    const connector = adzunaConnector(
      {
        fetchJson: async (url: string) => {
          asked.push(url);
          return { results: adzunaFixture };
        },
        reportFailure,
      },
      // the id alone is set: a missing key is no credential
      { appId: "id", appKey: "", countries: ["gb"], queries: ["engineering director"], pages: 1 }
    );

    expect(await connector.run()).toEqual([]);
    expect(asked).toEqual([]);
    expect(reported).toEqual([
      {
        source: "adzuna",
        unit: "source",
        status: undefined,
        transient: true,
        message: "no Adzuna credentials, the source was not asked",
      },
    ]);
  });
});

describe("failed feed reporting and feed tags", () => {
  it("greenhouse reports a failed board and tags each job with its board", async () => {
    const { reported, reportFailure } = recorder();
    const connector = greenhouseConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("deadboard")) throw rateLimited();
          return greenhouseFixture;
        },
        reportFailure,
      },
      { tokens: ["deadboard", "stripe"] }
    );
    const jobs = await connector.run();
    expectOneFailure(reported, "greenhouse", "deadboard");
    expect(jobs.length).toBe(5);
    expect(jobs.every((j) => j.feedUnit === "stripe")).toBe(true);
  });

  it("lever reports a failed board and tags each job with its board", async () => {
    const { reported, reportFailure } = recorder();
    const connector = leverConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("deadboard")) throw rateLimited();
          return leverFixture;
        },
        reportFailure,
      },
      { tokens: ["deadboard", "netomi"] }
    );
    const jobs = await connector.run();
    expectOneFailure(reported, "lever", "deadboard");
    expect(jobs.length).toBe(2);
    expect(jobs.every((j) => j.feedUnit === "netomi")).toBe(true);
  });

  it("ashby reports a failed board and tags each job with its board", async () => {
    const { reported, reportFailure } = recorder();
    const connector = ashbyConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("deadboard")) throw rateLimited();
          return { jobs: ashbyFixture };
        },
        reportFailure,
      },
      { tokens: ["deadboard", "docker"], names: {} }
    );
    const jobs = await connector.run();
    expectOneFailure(reported, "ashby", "deadboard");
    expect(jobs.length).toBe(1);
    expect(jobs[0].feedUnit).toBe("docker");
  });

  it("workable reports a failed query and location and keeps the first feed of a job", async () => {
    const { reported, reportFailure } = recorder();
    const connector = workableConnector(
      {
        fetchJson: async (url: string) => {
          const params = new URL(url).searchParams;
          if (params.get("query") === "CTO" && params.get("location") === "Qatar") throw rateLimited();
          return workableFixture;
        },
        reportFailure,
      },
      { queries: ["CTO", "Head of Engineering"], locations: ["United Arab Emirates", "Qatar"] }
    );
    const jobs = await connector.run();
    expectOneFailure(reported, "workable", "CTO/Qatar");
    // the other three units all return both jobs
    expect(jobs.length).toBe(2);
    expect(jobs.every((j) => j.feedUnit === "CTO/United Arab Emirates")).toBe(true);
  });

  it("jobicy reports a failed tag and names each feed by its tag or plain", async () => {
    const { reported, reportFailure } = recorder();
    const plain = { jobs: jobicyFixture.jobs ?? jobicyFixture };
    const taggedHit = { ...plain.jobs[0], id: 99901, jobTitle: "Head of Engineering" };
    const connector = jobicyConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("tag=cto")) throw rateLimited();
          return url.includes("tag=head") ? { jobs: [taggedHit] } : plain;
        },
        reportFailure,
      },
      { count: 5, tags: ["cto", "head of engineering"] }
    );
    const jobs = await connector.run();
    expectOneFailure(reported, "jobicy", "cto");
    expect(jobs.find((j) => j.externalId === "jc-99901")?.feedUnit).toBe("head of engineering");
    expect(jobs.filter((j) => j.externalId !== "jc-99901").every((j) => j.feedUnit === "plain")).toBe(true);
  });

  it("jobicy warns of a failed feed by its unit, never by a URL with its query string", async () => {
    // a plain array: vitest clears mock call history before each test
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
      warnings.push(parts.join(" "));
    });
    try {
      const connector = jobicyConnector(
        {
          fetchJson: async () => {
            throw rateLimited();
          },
        },
        { count: 5, tags: ["cto"] }
      );
      await connector.run();
    } finally {
      warn.mockRestore();
    }
    expect(warnings).toEqual(["[jobicy] fetch failed for plain: HTTP 429", "[jobicy] fetch failed for cto: HTTP 429"]);
  });

  it("arbeitnow reports a failed job page and a failed visa feed page by their numbers", async () => {
    const { reported, reportFailure } = recorder();
    const data = arbeitnowFixture.data ?? arbeitnowFixture;
    const connector = arbeitnowConnector(
      {
        fetchJson: async (url: string) => {
          if (new URL(url).searchParams.get("page") === "2") throw rateLimited();
          return url.includes("visa_sponsorship=true") ? { data: [data[0]] } : { data };
        },
        reportFailure,
      },
      { pages: 2 }
    );
    const jobs = await connector.run();
    expect(reported).toEqual([
      { source: "arbeitnow", unit: "page-2", status: 429, transient: true, message: "HTTP 429" },
      { source: "arbeitnow", unit: "visa-feed-2", status: 429, transient: true, message: "HTTP 429" },
    ]);
    expect(jobs.length).toBe(3);
    expect(jobs.every((j) => j.feedUnit === "page-1")).toBe(true);
  });

  it("himalayas reports a failed page under its query and seniority", async () => {
    const { reported, reportFailure } = recorder();
    const connector = himalayasConnector(
      {
        fetchJson: async (url: string) => {
          const params = new URL(url).searchParams;
          if (params.get("seniority") === "Director" && params.get("page") === "2") throw rateLimited();
          return { jobs: himalayasFixture, offset: 0, totalCount: himalayasFixture.length + 5 };
        },
        reportFailure,
      },
      { pages: 2, queries: ["engineering"], now: HIMALAYAS_RUN }
    );
    const jobs = await connector.run();
    expectOneFailure(reported, "himalayas", "engineering/Director");
    // the Executive feeds return the same jobs, which keep the feed that first returned them
    expect(jobs.length).toBe(2);
    expect(jobs.every((j) => j.feedUnit === "engineering/Director")).toBe(true);
  });

  it("reports an error without a transient flag as transient", async () => {
    const { reported, reportFailure } = recorder();
    const connector = greenhouseConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("deadboard")) throw new Error("boom");
          return greenhouseFixture;
        },
        reportFailure,
      },
      { tokens: ["deadboard"] }
    );
    await connector.run();
    expect(reported).toEqual([{ source: "greenhouse", unit: "deadboard", status: undefined, transient: true, message: "boom" }]);
  });

  // one row per connector: how it is built for one feed, and the unit of the first feed it asks
  const notTransient: ReadonlyArray<[string, (deps: FetchDeps) => { run: () => Promise<unknown> }, string]> = [
    ["greenhouse", (deps) => greenhouseConnector(deps, { tokens: ["deadboard"] }), "deadboard"],
    ["lever", (deps) => leverConnector(deps, { tokens: ["deadboard"] }), "deadboard"],
    ["ashby", (deps) => ashbyConnector(deps, { tokens: ["deadboard"], names: {} }), "deadboard"],
    ["workable", (deps) => workableConnector(deps, { queries: ["CTO"], locations: ["Qatar"] }), "CTO/Qatar"],
    ["jobicy", (deps) => jobicyConnector(deps, { count: 5 }), "plain"],
    ["arbeitnow", (deps) => arbeitnowConnector(deps, { pages: 1 }), "page-1"],
    [
      "himalayas",
      (deps) => himalayasConnector(deps, { pages: 1, queries: ["engineering"], now: HIMALAYAS_RUN }),
      "engineering/Director",
    ],
    [
      "adzuna",
      (deps) =>
        adzunaConnector(deps, { appId: "id", appKey: "key", countries: ["gb"], queries: ["engineering director"], pages: 1 }),
      "gb/engineering director",
    ],
  ];

  it.each(notTransient)("passes a failure that is not transient through as not transient: %s", async (source, connector, unit) => {
    const { reported, reportFailure } = recorder();

    await connector({ fetchJson: async () => { throw goneForGood(); }, reportFailure }).run();
    // a connector may report a second feed of its own: none of the reports may read as transient
    expect(reported[0]).toEqual({ source, unit, status: 404, transient: false, message: "HTTP 404" });
    expect(reported.every((failure) => failure.transient === false)).toBe(true);
  });

  it("reports a thrown value that is not an Error by its text", async () => {
    const { reported, reportFailure } = recorder();
    const connector = greenhouseConnector(
      {
        fetchJson: async () => {
          throw "quota exceeded";
        },
        reportFailure,
      },
      { tokens: ["deadboard"] }
    );
    await connector.run();
    expect(reported).toEqual([
      { source: "greenhouse", unit: "deadboard", status: undefined, transient: true, message: "quota exceeded" },
    ]);
  });

  it("goes on to the next feed when the reporter itself throws", async () => {
    const connector = greenhouseConnector(
      {
        fetchJson: async (url: string) => {
          if (url.includes("deadboard")) throw rateLimited();
          return greenhouseFixture;
        },
        reportFailure: () => {
          throw new Error("the reporter broke");
        },
      },
      { tokens: ["deadboard", "stripe"] }
    );
    expect(await connector.run()).toHaveLength(5);
  });
});
