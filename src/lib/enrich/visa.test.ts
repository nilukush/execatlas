import { describe, expect, it } from "vitest";
import { detectRelocation, detectVisa, relocationEvidence, visaEvidence } from "./visa";
import type { VisaSignal } from "../types";

const REFUSALS = [
  "Visa sponsorship: Not available for this role.",
  "We do not sponsor visas.",
  "Visa sponsorship is not offered for this role.",
  "Please note that for this position, we are not able to consider candidates who currently or in the future will require visa sponsorship.",
  "OKX will be prioritising applicants who have a current right to work in Singapore, and do not require OKX's sponsorship of a visa.",
  "Must be authorized to work in the U.S. without the need for current or future employer sponsorship",
];

const LEGO_LINE =
  "Job Description Director, Cost Engineering The LEGO Group , Singapore or Billund Relocation support can be provided An exceptional opportunity to join the team!";

describe("visaEvidence", () => {
  it("returns the sentence that carries the positive signal", () => {
    const text =
      "About us. We are a fintech. Visa sponsorship is available for exceptional candidates. Apply now.";
    expect(visaEvidence(text)).toBe("Visa sponsorship is available for exceptional candidates.");
  });

  it("returns the refusing sentence for a negative signal", () => {
    const text = "Join our team. We are unable to offer sponsorship for this role. Perks follow.";
    expect(visaEvidence(text)).toBe("We are unable to offer sponsorship for this role.");
  });

  it("returns null when the signal is unknown", () => {
    expect(visaEvidence("A plain posting with no visa language at all.")).toBeNull();
  });

  it.each(REFUSALS)("returns the exact refusal sentence inside a posting: %s", (refusal) => {
    expect(visaEvidence(`We are hiring. ${refusal}\nYou will lead five teams.`)).toBe(refusal);
  });

  it("quotes the refusal when the posting affirms sponsorship elsewhere", () => {
    const text = "We sponsor work visas. This position is not eligible for sponsorship.";
    expect(detectVisa(text)).toBe("no");
    expect(visaEvidence(text)).toBe("This position is not eligible for sponsorship.");
  });

  it("quotes at most 200 characters around the match from a 600 character run-on sentence", () => {
    const sentence = `${"7".repeat(542)} visa sponsorship is available for exceptional candidates.`;
    expect(sentence.length).toBe(600);
    const quote = visaEvidence(sentence);
    expect(quote).toContain("visa sponsorship is available");
    expect(quote?.length ?? 201).toBeLessThanOrEqual(200);
    expect(quote).not.toMatch(/^\d/);
  });

  it("quotes from the first word when the signal opens a long sentence", () => {
    const sentence =
      "United States citizenship and eligibility to obtain Top Secret / Sensitive Compartmented Information (TS/SCI) clearance, with active or prior security clearance a plus";
    expect(sentence.length).toBeGreaterThan(150);
    expect(visaEvidence(sentence)).toBe("United States citizenship");
  });

  it("never returns more than 200 characters", () => {
    const sentence = `Unfortunately we are not able to consider candidates ${"very ".repeat(27)}unlikely to require visa sponsorship.`;
    expect(detectVisa(sentence)).toBe("no");
    const quote = visaEvidence(sentence);
    expect(quote).toMatch(/^Unfortunately we are not able to consider candidates very/);
    expect(quote?.length ?? 201).toBeLessThanOrEqual(200);
  });

  it("splits on a line break even after an abbreviation", () => {
    const text = "Must be authorized to work in the U.S.\nWe offer 30 days of leave.";
    expect(visaEvidence(text)).toBe("Must be authorized to work in the U.S.");
  });

  it("ends a sentence at a full stop inside a closing quote", () => {
    const text = "We “do not sponsor visas.” Perks follow.";
    expect(visaEvidence(text)).toBe("We “do not sponsor visas.”");
  });

  it("returns one line when a posting lists its signals without sentence periods", () => {
    const text = [
      "What’s in it for you",
      "💰Base salary £150, 000 - £200, 000 + Equity + Benefits",
      "✈️ We can help you relocate to the UK",
      "✅ We can sponsor visas",
      "📍This role can be based in our London office, but we're open to distributed working within the UK (with ad hoc meetings in London).",
    ].join("\n");
    expect(visaEvidence(text)).toBe("✅ We can sponsor visas");
  });
});

describe("relocationEvidence", () => {
  it("returns the clause that carries the signal in a run-on line", () => {
    expect(relocationEvidence(LEGO_LINE)).toBe("Singapore or Billund Relocation support can be provided");
  });

  it("returns the refusing sentence for a negative signal", () => {
    const text = "Join our team. This position is not eligible for relocation assistance. Perks follow.";
    expect(relocationEvidence(text)).toBe("This position is not eligible for relocation assistance.");
  });

  it("returns null when the signal is unknown", () => {
    expect(relocationEvidence("We offer visa sponsorship for the right candidate.")).toBeNull();
  });

  it("quotes the refusal when support is offered elsewhere", () => {
    const text = "Relocation support can be provided. No relocation assistance can be offered at this time.";
    expect(detectRelocation(text)).toBe("no");
    expect(relocationEvidence(text)).toBe("No relocation assistance can be offered at this time.");
  });
});

describe("detectVisa and detectRelocation", () => {
  const cases: Array<[string, VisaSignal, VisaSignal]> = [
    // sponsorship offered
    ["We offer visa sponsorship for the right candidate.", "yes", "unknown"],
    ["Visa sponsorship available for this role.", "yes", "unknown"],
    ["We sponsor work visas and provide relocation support.", "yes", "yes"],
    ["The company will sponsor an employment visa.", "yes", "unknown"],
    ["We provide visa and work permit sponsorship.", "yes", "unknown"],
    ["Assistance with visa applications is available.", "yes", "unknown"],
    // affirmations on the site that the refusal forms must not hide
    [
      "Visa sponsorship: We do sponsor visas! However, we aren’t able to successfully sponsor visas for every role and every candidate. But if we make you an offer, we will make every reasonable effort to get you a visa, and we retain an immigration lawyer to help with this.",
      "yes",
      "unknown",
    ],
    [
      "We can sponsor visas to Germany; for any other country, you need to have existing right to work.",
      "yes",
      "unknown",
    ],
    // sponsorship refused
    ["Applicants must have existing right to work in the UAE.", "no", "unknown"],
    ["Candidates must have valid work authorization in the Kingdom.", "no", "unknown"],
    ["No visa sponsorship available for this position.", "no", "unknown"],
    ["We are unable to offer visa sponsorship.", "no", "unknown"],
    ["This role does not offer visa sponsorship.", "no", "unknown"],
    ["You must already hold a work permit.", "no", "unknown"],
    ["Applicants must hold their own right to work.", "no", "unknown"],
    ["This position is not eligible for sponsorship.", "no", "unknown"],
    ...REFUSALS.map((refusal): [string, VisaSignal, VisaSignal] => [refusal, "no", "unknown"]),
    ["We don't sponsor visas.", "no", "unknown"],
    ["We cannot offer visa sponsorship for this role.", "no", "unknown"],
    ["We will not be able to sponsor visas for this role.", "no", "unknown"],
    ["iSpot is not able to sponsor or take over sponsorship of an employment visa for this position at this time.", "no", "unknown"],
    ["Sponsorship, in any form, is not available for this position.", "no", "unknown"],
    ["Note: We will be unable to facilitate H1-B Visa transfer or sponsorship, along with STEM-OPT Visa.", "no", "unknown"],
    ["***This position is not eligible for immigration sponsorship", "no", "unknown"],
    [
      "For US based roles only, please note the Company may not be able to employ candidates for this role who have United States work authorization related to certain U.S. visa categories, or support future H-1B sponsorship at this time.",
      "no",
      "unknown",
    ],
    // right to work required before applying
    ["Applicants must be authorized to work in the United States.", "no", "unknown"],
    ["Must be located and authorized to work in the US", "no", "unknown"],
    [
      "You must live in the United States and be authorized to work in the United States without requirement of employmentsponsorship/visa.",
      "no",
      "unknown",
    ],
    ["Applicants must be currently authorized to work in the United States on a full-time basis.", "no", "unknown"],
    ["Must be legally eligible to work in the United States.", "no", "unknown"],
    ["Must be eligible to work in the US without company sponsorship.", "no", "unknown"],
    ["You will need the right to work in the UK.", "no", "unknown"],
    ["Candidates must meet in-country work authorization requirements.", "no", "unknown"],
    ["Permanent US work authorization is a condition of employment with onX.", "no", "unknown"],
    ["We ask all applicants to confirm their right to work in the UK.", "no", "unknown"],
    ["This role is available to candidates eligible to work in New York or Toronto, hybrid.", "no", "unknown"],
    [
      "Location & eligibility: This role is open to candidates based in Europe (including UK) only with a valid right to work.",
      "no",
      "unknown",
    ],
    ["Based on contractual obligations, candidate must be located within the United States and be a U.S. Citizen.", "no", "unknown"],
    ["Must be a U.S. Citizen.", "no", "unknown"],
    [
      "Must be a U.S. Person (U.S. citizen, lawful permanent resident, or other protected individual as defined by 22 CFR 120.62) due to access to ITAR-controlled technical data.",
      "no",
      "unknown",
    ],
    [
      "United States citizenship and eligibility to obtain Top Secret / Sensitive Compartmented Information (TS/SCI) clearance, with active or prior security clearance a plus",
      "no",
      "unknown",
    ],
    [
      "Valid passport, citizenship, and/or work authorization for France, with the ability to travel and work across the EU",
      "no",
      "unknown",
    ],
    // relocation only: no visa signal either way
    ["Relocation Statement: This position is not eligible for relocation assistance.", "unknown", "no"],
    ["Relocation assistance is not available for this position.", "unknown", "no"],
    ["Relocation assistance will not be provided for this role.", "unknown", "no"],
    ["No relocation assistance can be offered at this time.", "unknown", "no"],
    ["Relocation support cannot be provided for this role.", "unknown", "no"],
    ["Relocation support can be provided", "unknown", "yes"],
    ["Benefits vary by country and may include housing and relocation support.", "unknown", "yes"],
    ["Berlin relocation support", "unknown", "yes"],
    ["Relocation assistance provided.", "unknown", "yes"],
    ["Assistance with relocation is available.", "unknown", "yes"],
    // sounds like a refusal but is not one
    ["We're unable to offer individual feedback during the interview process.", "unknown", "unknown"],
    ["We participate in E-Verify and confirm work authorization with Form I-9 data.", "unknown", "unknown"],
    [
      "We are unable to consider candidates unwilling to be in Geneva, but we are willing to relocate the right candidate.",
      "unknown",
      "unknown",
    ],
    [
      "Hatch participates in E-Verify and will provide the federal government with your Form I-9 information to confirm that you are authorized to work in the U.S.",
      "unknown",
      "unknown",
    ],
    [
      "If E-Verify cannot confirm that you are authorized to work, this employer is required to give you written instructions.",
      "unknown",
      "unknown",
    ],
    [
      "In compliance with federal law, all persons hired will be required to verify identity and eligibility to work in the United States and to complete the required employment eligibility verification form upon hire.",
      "unknown",
      "unknown",
    ],
    ["View the Right to Work Poster in English and Español.", "unknown", "unknown"],
    [
      "All offers of employment are contingent upon an individual’s ability to secure and maintain the legal right to work at the company and in the specified work location, if applicable.",
      "unknown",
      "unknown",
    ],
    [
      "We do not discriminate against qualified employees or applicants because of race, color, religion, gender identity, sex, sexual identity, pregnancy, national origin, ancestry, citizenship.",
      "unknown",
      "unknown",
    ],
    ["Serve as the executive sponsor for complex cross-organizational initiatives, aligning R&D, marketing, and operations on shared goals.", "unknown", "unknown"],
    ["Experience working with global card schemes (Visa, Mastercard) or major local payment networks.", "unknown", "unknown"],
    [
      "**This position is eligible to work from home anywhere in the United States with preference given to those living in the Des Moines, Iowa metro area.",
      "unknown",
      "unknown",
    ],
    // nothing said
    ["We are looking for a hands-on engineering leader in Dubai.", "unknown", "unknown"],
    ["You will lead five teams across three products.", "unknown", "unknown"],
    ["", "unknown", "unknown"],
  ];

  it.each(cases)('"%s" -> visa %s, relocation %s', (text, visa, relocation) => {
    expect(detectVisa(text)).toBe(visa);
    expect(detectRelocation(text)).toBe(relocation);
  });

  it("treats explicit refusals as no even when generic sponsor language appears elsewhere", () => {
    const mixed =
      "We sponsor visas for some positions. For this one, candidates must already have the right to work in the UK.";
    expect(detectVisa(mixed)).toBe("no");
  });
});
