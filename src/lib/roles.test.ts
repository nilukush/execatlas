import { describe, expect, it } from "vitest";
import {
  buildQueryMatrix,
  classifyTitle,
  workableSeedQueries,
} from "./roles";

describe("buildQueryMatrix", () => {
  it("includes the owner's canonical phrases", () => {
    const phrases = buildQueryMatrix().map((q) => q.phrase);
    for (const expected of [
      "Director of Engineering",
      "Director of Engineering and Product",
      "Director of Product and Engineering",
      "Director of Software Engineering",
      "Director of Technology",
      "Director of Product and Technology",
      "AVP of Engineering",
      "Assistant Vice President of Engineering",
      "VP of Engineering",
      "Vice President of Engineering",
      "Head of Engineering",
      "Head of Product and Engineering",
      "Chief Technology Officer",
      "CTO",
      "CTPO",
      "Chief Technology and Product Officer",
      "CPTO",
      "Chief Product and Technology Officer",
    ]) {
      expect(phrases, `missing ${expected}`).toContain(expected);
    }
  });

  it("adds the ampersand variation of every phrase containing 'and'", () => {
    const phrases = buildQueryMatrix().map((q) => q.phrase);
    expect(phrases).toContain("Director of Engineering & Product");
    expect(phrases).toContain("VP of Product & Engineering");
    expect(phrases).toContain("Chief Technology & Product Officer");
  });

  it("adds the 'of'-dropped variation (VP of Engineering becomes VP Engineering)", () => {
    const phrases = buildQueryMatrix().map((q) => q.phrase);
    expect(phrases).toContain("VP Engineering");
    expect(phrases).toContain("Director Engineering");
    expect(phrases).toContain("VP Engineering & Product");
  });

  it("never emits duplicate phrases", () => {
    const all = buildQueryMatrix().map((q) => q.phrase.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it("every phrase classifies back to its own seniority and domain", () => {
    for (const q of buildQueryMatrix()) {
      const got = classifyTitle(q.phrase);
      expect(got, `phrase "${q.phrase}" did not classify`).not.toBeNull();
      expect(got?.seniority, `phrase "${q.phrase}"`).toBe(q.seniority);
      expect(got?.domain, `phrase "${q.phrase}"`).toBe(q.domain);
    }
  });
});

describe("classifyTitle", () => {
  const cases: Array<[string, ReturnType<typeof classifyTitle>]> = [
    // owner-specified families
    ["VP of Engineering", { seniority: "vp", domain: "engineering" }],
    ["VP Engineering", { seniority: "vp", domain: "engineering" }],
    ["VP Engineering & Product", { seniority: "vp", domain: "engineering-product" }],
    ["Vice President of Product and Engineering", { seniority: "vp", domain: "engineering-product" }],
    ["Senior Vice President of Software Engineering", { seniority: "vp", domain: "engineering" }],
    ["SVP, Technology", { seniority: "vp", domain: "technology" }],
    ["Director of Engineering", { seniority: "director", domain: "engineering" }],
    ["Director, Software Engineering", { seniority: "director", domain: "engineering" }],
    ["Director of Technology and Product", { seniority: "director", domain: "engineering-product" }],
    ["Engineering Director", { seniority: "director", domain: "engineering" }],
    ["AVP of Engineering", { seniority: "avp", domain: "engineering" }],
    ["Assistant Vice President of Technology", { seniority: "avp", domain: "technology" }],
    ["Assistant VP, Product and Software Engineering", { seniority: "avp", domain: "engineering-product" }],
    ["Head of Engineering", { seniority: "head", domain: "engineering" }],
    ["Global Head of Software Engineering", { seniority: "head", domain: "engineering" }],
    ["Head of Technology", { seniority: "head", domain: "technology" }],
    ["Chief Technology Officer", { seniority: "cto", domain: "technology" }],
    ["CTO", { seniority: "cto", domain: "technology" }],
    ["CTPO", { seniority: "cto", domain: "engineering-product" }],
    ["Chief Product and Technology Officer", { seniority: "cto", domain: "engineering-product" }],
    // real-world noise
    ["VP of Engineering (Dubai)", { seniority: "vp", domain: "engineering" }],
    ["Director of Engineering - Marketplace", { seniority: "director", domain: "engineering" }],
    ["Deputy Director of Technology", { seniority: "director", domain: "technology" }],
    // out of scope: no leadership seniority
    ["Senior Software Engineer", null],
    ["Staff Engineer", null],
    ["Engineering Manager", null],
    ["Product Manager", null],
    // out of scope: leadership but wrong domain
    ["VP of Sales", null],
    ["Director of Marketing", null],
    ["Head of Finance", null],
    ["Chief Financial Officer", null],
    ["Chief Operating Officer", null],
    // out of scope: pure product leadership (owner matrix pairs product with engineering/technology only)
    ["VP of Product", null],
    ["Head of Product", null],
    // out of scope: non-software "development" and "tech" compounds
    ["Director of Business Development", null],
    ["VP of Business Development", null],
    ["Director of Talent Acquisition, Deep Tech", null],
    ["Head of Learning and Development", null],
    ["Director of Sales Development", null],
    ["Director, Corporate Development", null],
    ["VP of Strategy and Corporate Development", null],
    ["Director / Senior Director - Talent Development, Quality and Change", null],
    ["Head of Organization Development", null],
    ["Partner Account Director - Platinum Partner Development", null],
    ["Senior Director, Hardware & Vehicle Development", null],
    // out of scope: creative and sales leadership reading as tech via stray words
    ["Art Director (Tech-savvy)", null],
    ["Creative Director", null],
    ["Director, Strategic Accounts - Logistics & Tech, m/f/d", null],
    // product development stays in scope (engineering adjacent)
    ["Director of Product Development", { seniority: "director", domain: "engineering-product" }],
    ["Head of App Development", { seniority: "head", domain: "engineering" }],
  ];

  it.each(cases)('classifies "%s"', (title, expected) => {
    expect(classifyTitle(title)).toEqual(expected);
  });
});

describe("workableSeedQueries", () => {
  it("returns a bounded, deduplicated list of seed queries for search sources", () => {
    const seeds = workableSeedQueries();
    expect(seeds.length).toBeGreaterThan(5);
    expect(seeds.length).toBeLessThanOrEqual(16);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const seed of seeds) {
      expect(classifyTitle(seed), `seed "${seed}" must be in scope`).not.toBeNull();
    }
  });
});
