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
    ["Director, WMS Product Design and Development", { seniority: "director", domain: "engineering-product" }],
    ["Agency Development Director, DACH", null],
    ["Product Manager", null],
    // out of scope: leadership but wrong domain
    ["VP of Sales", null],
    ["Director of Marketing", null],
    ["Head of Finance", null],
    ["Chief Financial Officer", null],
    ["Chief Operating Officer", null],
    // out of scope: pure product leadership (owner matrix pairs product with engineering/technology only)
    ["VP of Product", { seniority: "vp", domain: "product" }],
    ["Head of Product", { seniority: "head", domain: "product" }],
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
    expect(seeds.length).toBeLessThanOrEqual(24);
    expect(new Set(seeds).size).toBe(seeds.length);
    for (const seed of seeds) {
      expect(classifyTitle(seed), `seed "${seed}" must be in scope`).not.toBeNull();
    }
  });
});

describe("adjacent senior families in scope", () => {
  it("classifies pure product leadership", () => {
    expect(classifyTitle("Director of Product")).toEqual({ seniority: "director", domain: "product" });
    expect(classifyTitle("VP of Product Management")).toEqual({ seniority: "vp", domain: "product" });
    expect(classifyTitle("Head of Product")).toEqual({ seniority: "head", domain: "product" });
  });

  it("classifies design leadership", () => {
    expect(classifyTitle("VP of Design")).toEqual({ seniority: "vp", domain: "design" });
    expect(classifyTitle("Director of Product Design")).toEqual({ seniority: "director", domain: "design" });
    expect(classifyTitle("Head of UX")).toEqual({ seniority: "head", domain: "design" });
  });

  it("classifies data and analytics leadership", () => {
    expect(classifyTitle("Director of Data")).toEqual({ seniority: "director", domain: "data" });
    expect(classifyTitle("Head of Data Science")).toEqual({ seniority: "head", domain: "data" });
    expect(classifyTitle("VP of Analytics")).toEqual({ seniority: "vp", domain: "data" });
  });

  it("keeps sales and marketing leadership out of the widened families", () => {
    expect(classifyTitle("Director, Sales - Data & AI Security")).toBeNull();
    expect(classifyTitle("Head of Product Marketing")).toBeNull();
    expect(classifyTitle("VP of Sales Engineering")).toBeNull();
    expect(classifyTitle("Director of Product, Growth and Marketing")).toBeNull();
  });

  it("keeps non-technology design and product noise out", () => {
    expect(classifyTitle("Director of Fashion Design")).toBeNull();
    expect(classifyTitle("Interior Design Director")).toBeNull();
    expect(classifyTitle("Creative Director")).toBeNull();
    expect(classifyTitle("Director of Instructional Design")).toBeNull();
  });

  it("keeps engineering precedence over the new families in mixed titles", () => {
    expect(classifyTitle("VP of Engineering and Design")).toEqual({ seniority: "vp", domain: "engineering" });
    expect(classifyTitle("Director of Product and Data")).toEqual({ seniority: "director", domain: "data" });
  });
});

describe("widening leak regressions (reviewer scan 2026-09-20)", () => {
  it.each([
    "VP, Legal Counsel - Data Privacy, Digital & Technology",
    "Head of Brokerage, Product & Commercial Legal Department",
    "Director, Corporate & Product Communications",
    "Executive Communications Director, Chief Product & Technology Officer",
    "Head, Product Control & Accounting",
    "Associate Director - Healthcare Communications (DATA)",
    "Corporate Finance - VP - Portfolio Analytics",
    "Director of Operations - Data Centers",
    "Project Director - Data Centre Projects in Europe",
    "Head of Project Management/ Lead (Engineering, Construction) - East",
    "Director - Design Project Management (Mixed Use - Urban Core)",
    "Creative Project Manager/ Director (3D Design - Creative Agency)",
    "Director, Data Analytics Consulting",
    "Associate Director/Director - Tech Consulting (Pharma/Lifesciences)",
    "Technical Chief of Staff - Office of the CTO & CSO",
    "Head of Data Entry",
  ])("%s stays out of scope", (title) => {
    expect(classifyTitle(title)).toBeNull();
  });

  it("keeps advisory analyst and physical-project leadership out", () => {
    expect(classifyTitle("VP, Analyst - Chief Supply Chain Officer - Strategy, Technology & Transformation")).toBeNull();
    expect(classifyTitle("Sr Director Analyst, HR Technology - Talent & Learning")).toBeNull();
    expect(classifyTitle("Head of Project Engineering (LQ) (F-4851-I)")).toBeNull();
    expect(classifyTitle("Director, Engineering (Remote, GA, US, 99999)")).toBeNull();
    expect(classifyTitle("Vice President, Presales Engineering")).toBeNull();
    // analytics leadership stays in: analyst and analytics are different words
    expect(classifyTitle("Director of Analytics")).toEqual({ seniority: "director", domain: "data" });
  });

  it("keeps support-engineering leadership out", () => {
    expect(classifyTitle("Director of Support Engineering - Americas")).toBeNull();
  });

  it("keeps genuine CTO titles while dropping office tags", () => {
    expect(classifyTitle("Forward Deployed Engineer, Compliance [Office of the CTO]")).toBeNull();
    expect(classifyTitle("CTO, Acme Group")).toEqual({ seniority: "cto", domain: "technology" });
    expect(classifyTitle("Chief Technology Officer, EMEA")).toEqual({ seniority: "cto", domain: "technology" });
  });
});
