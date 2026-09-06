import { describe, expect, it } from "vitest";
import { answerQuestion, parseQuestion } from "./ask";
import type { IndexEntry } from "./types";

describe("parseQuestion", () => {
  it.each([
    {
      question: "Is it possible to get a VP of Engineering job in Dubai with visa sponsorship?",
      want: { query: "engineering", seniority: "vp", region: "middle-east", country: "AE", visa: "yes", workMode: "all" },
    },
    {
      question: "Are there any remote CTO roles in Europe?",
      want: { query: "", seniority: "cto", region: "europe", country: "all", visa: "all", workMode: "remote" },
    },
    {
      question: "Director of Engineering jobs in Singapore without visa sponsorship",
      want: { query: "engineering", seniority: "director", region: "southeast-asia", country: "SG", visa: "all", workMode: "all" },
    },
    {
      question: "hybrid Head of Software Engineering roles in india",
      want: { query: "engineering", seniority: "head", region: "india", country: "IN", visa: "all", workMode: "hybrid" },
    },
    {
      question: "VP Engineering & Product roles in the UAE",
      want: { query: "engineering product", seniority: "vp", region: "middle-east", country: "AE", visa: "all", workMode: "all" },
    },
    {
      question: "CTO position in Ho Chi Minh City",
      want: { query: "", seniority: "cto", region: "southeast-asia", country: "VN", visa: "all", workMode: "all" },
    },
    {
      question: "on-site AVP technology role in Germany",
      want: { query: "technology", seniority: "avp", region: "europe", country: "DE", visa: "all", workMode: "onsite" },
    },
    {
      question: "engineering leadership roles in egypt",
      want: { query: "engineering", seniority: "all", region: "north-africa", country: "EG", visa: "all", workMode: "all" },
    },
    {
      question: "Any jobs?",
      want: { query: "", seniority: "all", region: "all", country: "all", visa: "all", workMode: "all" },
    },
  ])("$question", ({ question, want }) => {
    expect(parseQuestion(question)).toEqual(want);
  });

  it("does not read AVP as VP", () => {
    expect(parseQuestion("AVP Engineering in Qatar").seniority).toBe("avp");
  });

  it("keeps region-only questions at country all", () => {
    const intent = parseQuestion("director roles in the middle east");
    expect(intent.region).toBe("middle-east");
    expect(intent.country).toBe("all");
  });
});

function makeEntry(partial: Partial<IndexEntry>): IndexEntry {
  return {
    id: partial.id ?? "j1",
    title: partial.title ?? "VP of Engineering",
    company: partial.company ?? "Acme",
    seniority: partial.seniority ?? "vp",
    domain: partial.domain ?? "engineering",
    countryIso2: partial.countryIso2 ?? "AE",
    countryName: partial.countryName ?? "United Arab Emirates",
    region: partial.region ?? "middle-east",
    remote: partial.remote ?? false,
    visa: partial.visa ?? "yes",
    workMode: partial.workMode ?? "onsite",
    roleType: partial.roleType ?? "permanent",
    postedAt: partial.postedAt ?? "2026-09-01",
    source: partial.source ?? "greenhouse",
  };
}

describe("answerQuestion", () => {
  const match = makeEntry({ id: "match", title: "VP of Engineering", company: "Desert Corp", countryIso2: "AE", visa: "yes" });
  const otherCountry = makeEntry({ id: "eu", title: "VP of Engineering", countryIso2: "DE", countryName: "Germany", region: "europe", visa: "yes" });
  const noVisa = makeEntry({ id: "novisa", title: "VP of Engineering", countryIso2: "AE", visa: "unknown" });

  it("answers yes with matches for a viable question", () => {
    const answer = answerQuestion("Is it possible to get a VP Engineering job in Dubai with visa sponsorship?", [match, otherCountry, noVisa]);
    expect(answer.yes).toBe(true);
    expect(answer.count).toBe(1);
    expect(answer.total).toBe(3);
    expect(answer.top.map((e) => e.id)).toEqual(["match"]);
    expect(answer.intent.country).toBe("AE");
  });

  it("answers no when nothing matches", () => {
    const answer = answerQuestion("VP Engineering in Dubai with visa sponsorship", [otherCountry, noVisa]);
    expect(answer.yes).toBe(false);
    expect(answer.count).toBe(0);
    expect(answer.top).toEqual([]);
  });

  it("caps the shown roles at three", () => {
    const entries = [1, 2, 3, 4].map((n) => makeEntry({ id: `m${n}`, postedAt: `2026-09-0${n}` }));
    const answer = answerQuestion("VP Engineering in Dubai with visa sponsorship", entries);
    expect(answer.count).toBe(4);
    expect(answer.top).toHaveLength(3);
  });
});
