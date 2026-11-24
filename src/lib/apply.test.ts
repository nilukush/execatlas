import { describe, expect, it } from "vitest";
import { applyDestination } from "./apply";

// every Adzuna host of the committed dataset
const adzunaHosts = [
  "www.adzuna.sg",
  "www.adzuna.in",
  "www.adzuna.co.uk",
  "www.adzuna.ca",
  "www.adzuna.com",
  "www.adzuna.es",
  "www.adzuna.de",
  "www.adzuna.pl",
  "www.adzuna.fr",
  "www.adzuna.nl",
  "www.adzuna.it",
];
const arbeitnowHosts = ["www.arbeitnow.fr", "www.arbeitnow.ch", "www.arbeitnow.com", "www.arbeitnow.nl"];

describe("applyDestination", () => {
  it.each(adzunaHosts)("names Adzuna for https://%s", (host) => {
    expect(applyDestination(`https://${host}/details/1`)).toBe("adzuna");
  });

  it.each([...arbeitnowHosts, "www.arbeitnow.co.uk"])("names Arbeitnow for https://%s", (host) => {
    expect(applyDestination(`https://${host}/jobs/1`)).toBe("arbeitnow");
  });

  it("names Himalayas and Jobicy", () => {
    expect(applyDestination("https://himalayas.app/jobs/product-director")).toBe("himalayas");
    expect(applyDestination("https://jobicy.com/jobs/1")).toBe("jobicy");
  });

  it.each([
    ["adzuna.sg", "adzuna"],
    ["arbeitnow.com", "arbeitnow"],
    ["himalayas.app", "himalayas"],
    ["jobicy.com", "jobicy"],
  ] as const)("reads %s the same without a leading www", (host, board) => {
    expect(applyDestination(`https://${host}/1`)).toBe(board);
  });

  it.each([
    "https://job-boards.greenhouse.io/embed/job_applications?for=acme/1",
    "https://jobs.lever.co/acme/1",
    "https://jobs.ashbyhq.com/acme/1",
    "https://apply.workable.com/acme/j/1",
    "https://jobs.workable.com/acme/j/1",
    "https://careers.example.com/1",
  ])("reads %s as the employer's own site", (url) => {
    expect(applyDestination(url)).toBe("employer");
  });

  it.each([
    "https://notadzuna.com/1",
    "https://adzuna.com.example.org/1",
    "https://careers.adzuna.com/1",
  ])("is not taken in by a host that only looks like a board, %s", (url) => {
    expect(applyDestination(url)).toBe("employer");
  });

  it.each(["", "/jobs/1", "adzuna.sg"])("reads a link without a host as the employer's own site: %j", (url) => {
    expect(applyDestination(url)).toBe("employer");
  });
});
