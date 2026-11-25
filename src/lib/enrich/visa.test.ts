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

// Negated noun phrases that read "Sponsors" before the fix round. Each must read "no", with its own sentence as the quote.
const NEGATED_NOUNS = [
  // found by the task review
  "Visa sponsorship isn't available for this role.",
  "Visa sponsorship isn't offered for this role.",
  "Visa sponsorship will not be available for this role.",
  "Visa sponsorship could not be provided.",
  "Visa sponsorship can not be provided.",
  "We are unable to consider candidates who require visa sponsorship.",
  "We cannot consider candidates requiring visa sponsorship.",
  "Applicants must not require visa sponsorship.",
  "Visa sponsorship is not possible for this role.",
  "This role does not include visa sponsorship.",
  "Visa sponsorship is not an option for this role.",
  // found by the probe of the last round
  "No employment visa sponsorship available.",
  "No work permit sponsorship is available.",
  "Visa sponsorship: No.",
  "Sponsorship of employment visas is not available.",
  // the unavailable forms keep working when words follow, and behind a verb the cue list did not know
  "Visa sponsorship: Unavailable for this role.",
  "Visa sponsorship is unavailable for this role.",
  "Sponsorship unavailable for this role.",
  "Visa sponsorship remains unavailable for this role.",
  "Visa sponsorship is currently unavailable.",
  "Visa sponsorship will remain unavailable for the rest of the year.",
  "Employment visas are not sponsored by the company.",
  "Candidates who require visa sponsorship are not eligible for this position.",
  "This position does not qualify for visa sponsorship.",
  "This position is not open to candidates requiring visa sponsorship.",
  "Relocation is provided, but visa sponsorship is not.",
  "Visa sponsorship is not something we offer.",
];

// Relocation refusals that read as support before the fix round. Each must read "no", with its own sentence as the quote.
const NEGATED_RELOCATION = [
  "Relocation assistance isn't available for this position.",
  "Relocation support won't be provided.",
  "Relocation support is not covered by us.",
  "We do not pay for relocation support.",
  "This role does not come with relocation assistance.",
  "Relocation package is not included.",
];

describe("visaEvidence", () => {
  it("returns the sentence that carries the positive signal", () => {
    const text =
      "About us. We are a fintech. Visa sponsorship is available for exceptional candidates. Apply now.";
    expect(detectVisa(text)).toBe("yes");
    expect(visaEvidence(text)).toBe("Visa sponsorship is available for exceptional candidates.");
  });

  it("returns the refusing sentence for a negative signal", () => {
    const text = "Join our team. We are unable to offer sponsorship for this role. Perks follow.";
    expect(detectVisa(text)).toBe("no");
    expect(visaEvidence(text)).toBe("We are unable to offer sponsorship for this role.");
  });

  it("returns null when the signal is unknown", () => {
    const text = "A plain posting with no visa language at all.";
    expect(detectVisa(text)).toBe("unknown");
    expect(visaEvidence(text)).toBeNull();
  });

  it.each(REFUSALS)("returns the exact refusal sentence inside a posting: %s", (refusal) => {
    const text = `We are hiring. ${refusal}\nYou will lead five teams.`;
    expect(detectVisa(text)).toBe("no");
    expect(visaEvidence(text)).toBe(refusal);
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

  it.each([
    ["We can sponsor your visa", "yes"],
    ["We do sponsor and take over sponsorship of employment visas for this role.", "yes"],
    ["If we make you an offer, we will make every reasonable effort to get you a visa.", "yes"],
    ["Visa sponsorship cannot be provided", "no"],
    ["Sponsorship cannot be provided for this role.", "no"],
    ["Visa sponsorship: Unavailable.", "no"],
    ["Visa sponsorship unavailable.", "no"],
    ["This position is not eligible for employment visa sponsorship.", "no"],
  ] as const)("returns the sentence itself as evidence, visa %s: %s", (sentence, verdict) => {
    const text = `We are hiring. ${sentence}\nYou will lead five teams.`;
    expect(detectVisa(text)).toBe(verdict);
    expect(visaEvidence(text)).toBe(sentence);
  });

  it("quotes the headline of a posting that goes on to hedge", () => {
    const text =
      "Visa sponsorship: We do sponsor visas! However, we aren't able to successfully sponsor visas for every role and every candidate. But if we make you an offer, we will make every reasonable effort to get you a visa, and we retain an immigration lawyer to help with this.";
    expect(detectVisa(text)).toBe("yes");
    expect(visaEvidence(text)).toBe("Visa sponsorship: We do sponsor visas!");
  });
});

describe("relocationEvidence", () => {
  it("returns the clause that carries the signal in a run-on line", () => {
    expect(relocationEvidence(LEGO_LINE)).toBe("Singapore or Billund Relocation support can be provided");
  });

  it("returns the refusing sentence for a negative signal", () => {
    const text = "Join our team. This position is not eligible for relocation assistance. Perks follow.";
    expect(detectRelocation(text)).toBe("no");
    expect(relocationEvidence(text)).toBe("This position is not eligible for relocation assistance.");
  });

  it("returns null when the signal is unknown", () => {
    const text = "We offer visa sponsorship for the right candidate.";
    expect(detectRelocation(text)).toBe("unknown");
    expect(relocationEvidence(text)).toBeNull();
  });

  it("quotes the refusal when support is offered elsewhere", () => {
    const text = "Relocation support can be provided. No relocation assistance can be offered at this time.";
    expect(detectRelocation(text)).toBe("no");
    expect(relocationEvidence(text)).toBe("No relocation assistance can be offered at this time.");
  });

  it.each([
    ["We can help you relocate to the UK", "yes"],
    ["We’ll help you relocate to the UK", "yes"],
    ["Relocation expense coverage to NYC or SF (if needed)", "yes"],
    ["Please note that this role would not provide relocation as a result.", "no"],
    ["Relocation assistance unavailable.", "no"],
  ] as const)("returns the sentence itself as evidence, relocation %s: %s", (sentence, verdict) => {
    const text = `Join our team.\n${sentence}\nPerks follow.`;
    expect(detectRelocation(text)).toBe(verdict);
    expect(relocationEvidence(text)).toBe(sentence);
  });

  it("returns the line that offers visa sponsorship and relocation", () => {
    const line =
      "📍 London, Barcelona, or UK Remote | 💰 £150,900 to £204,100 + stock options & benefits | ✅ Visa sponsorship & relocation available";
    expect(relocationEvidence(line)).toBe(line);
    expect(visaEvidence(line)).toBe(line);
  });

  it("returns the clause that carries the signal in a run-on line that uses colons", () => {
    const line =
      "Vice President of Engineering \u2013 Advanced Energy & Hardware Systems Location: Seattle, WA Employment Type: Full-Time | Executive Leadership Work Arrangement: Onsite Relocation: Assistance Available \u2013 Nationwide Candidates Welcome Lead Engineering Innovation from Research to Real-World Deployment Talent Solutions Group is conducting a confidential executive search for an accomplished Vice President of Engineering to join a growing, research-driven technology organization developing next-generatio\u2026";
    expect(line.length).toBe(500);
    expect(relocationEvidence(line)).toBe("Onsite Relocation: Assistance Available");
  });
});

describe("a refusal that negates a noun", () => {
  it.each(NEGATED_NOUNS)('reads visa "no" and is quoted: %s', (sentence) => {
    const text = `We are hiring. ${sentence}\nYou will lead five teams.`;
    expect(detectVisa(text)).toBe("no");
    expect(visaEvidence(text)).toBe(sentence);
  });

  it.each(NEGATED_RELOCATION)('reads relocation "no" and is quoted: %s', (sentence) => {
    const text = `Join our team.\n${sentence}\nPerks follow.`;
    expect(detectRelocation(text)).toBe("no");
    expect(detectVisa(text)).toBe("unknown");
    expect(relocationEvidence(text)).toBe(sentence);
  });
});

describe("a relocation refusal never reads as a visa refusal", () => {
  it.each([
    ["We cannot offer relocation, and we sponsor visas.", "unknown"],
    ["We do not offer relocation; visa sponsorship is available for all roles.", "yes"],
    ["We do not offer relocation assistance.” Visa sponsorship is available for all roles.", "yes"],
    ["We will not only sponsor visas, but also pay the legal fees.", "yes"],
    ["We do not offer relocation assistance.” We sponsor visas.", "yes"],
    ["We are unable to consider remote applications.” Candidates who require visa sponsorship are welcome.", "yes"],
  ] as const)("visa %s: %s", (sentence, visa) => {
    expect(detectVisa(sentence)).toBe(visa);
  });

  it.each([
    "We cannot offer relocation, and we sponsor visas.",
    "We do not offer relocation; visa sponsorship is available for all roles.",
    "We do not offer relocation assistance.” Visa sponsorship is available for all roles.",
  ])("still refuses relocation: %s", (sentence) => {
    expect(detectRelocation(sentence)).toBe("no");
  });
});

describe("the noun guard", () => {
  it.each([
    ["Relocation assistance is not available for this position; visa sponsorship is available for the right candidate.", "no"],
    ["We do not offer relocation assistance, but visa sponsorship is available for the right candidate.", "no"],
    ["Relocation assistance is not available. Visa sponsorship is available for the right candidate.", "no"],
  ] as const)("keeps an affirmation visible after a refusal: %s", (sentence, relocation) => {
    expect(detectVisa(sentence)).toBe("yes");
    expect(detectRelocation(sentence)).toBe(relocation);
  });

  it.each([
    "Visa sponsorship is not on offer for this role.",
    "No form of visa sponsorship is available.",
    "We do not assist with visa applications.",
    "We cannot assist with work permits.",
  ])("reads unknown for a negated noun phrase it does not list: %s", (sentence) => {
    expect(detectVisa(sentence)).toBe("unknown");
  });

  it.each(["Relocation assistance is not an option for this position.", "We never pay for relocation support."])(
    "reads unknown for a negated relocation phrase it does not list: %s",
    (sentence) => {
      expect(detectRelocation(sentence)).toBe("unknown");
    }
  );

  it("counts a cue before a noun only within 40 characters", () => {
    const near = `We never ${"ab ".repeat(13)}visa sponsorship for this role.`;
    const far = `We never ${"ab ".repeat(12)}abc visa sponsorship for this role.`;
    const distance = (text: string): number => text.indexOf("visa sponsorship") - (text.indexOf("never") + 5);
    expect(distance(near)).toBe(40);
    expect(distance(far)).toBe(41);
    expect(detectVisa(near)).toBe("unknown");
    expect(detectVisa(far)).toBe("yes");
  });

  it("counts a cue after a noun only within 40 characters", () => {
    const near = `Visa sponsorship${" ab".repeat(13)} not offered for this role.`;
    const far = `Visa sponsorship${" ab".repeat(13)}  not offered for this role.`;
    const distance = (text: string): number => text.indexOf("not offered") - (text.indexOf("Visa sponsorship") + 16);
    expect(distance(near)).toBe(40);
    expect(distance(far)).toBe(41);
    expect(detectVisa(near)).toBe("unknown");
    expect(detectVisa(far)).toBe("yes");
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
      "Visa sponsorship: We do sponsor visas! However, we aren't able to successfully sponsor visas for every role and every candidate. But if we make you an offer, we will make every reasonable effort to get you a visa, and we retain an immigration lawyer to help with this.",
      "yes",
      "unknown",
    ],
    [
      "We can sponsor visas to Germany; for any other country, you need to have existing right to work.",
      "yes",
      "unknown",
    ],
    // sponsorship the site offers that the matcher missed
    ["We can sponsor your visa", "yes", "unknown"],
    ["We do sponsor and take over sponsorship of employment visas for this role.", "yes", "unknown"],
    ["If we make you an offer, we will make every reasonable effort to get you a visa.", "yes", "unknown"],
    // a negation cue that does not govern the verb leaves the line an affirmation
    ["We do sponsor visas", "yes", "unknown"],
    ["Not only do we offer visa sponsorship", "yes", "unknown"],
    ["Not only do we sponsor visas", "yes", "unknown"],
    ["We cannot offer relocation. We sponsor visas.", "yes", "no"],
    [
      "We are not able to confirm the start date before an offer is signed, and we sponsor visas.",
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
    // refusals of the sponsorship forms above, so that none of them reads a refusal as sponsorship
    ["We cannot sponsor your visa.", "no", "unknown"],
    ["We do not sponsor employment visas for this role.", "no", "unknown"],
    // refusal forms that are not on the site yet
    ["Visa sponsorship cannot be provided", "no", "unknown"],
    ["Sponsorship cannot be provided for this role.", "no", "unknown"],
    ["Visa sponsorship can't be provided.", "no", "unknown"],
    ["Visa sponsorship: Unavailable.", "no", "unknown"],
    ["Visa sponsorship unavailable.", "no", "unknown"],
    ["This position is not eligible for employment visa sponsorship.", "no", "unknown"],
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
    // relocation forms the site carries, outside the brief
    ["We can help you relocate to the UK", "unknown", "yes"],
    ["We’ll help you relocate to the UK", "unknown", "yes"],
    ["Visa sponsorship & relocation available", "yes", "yes"],
    ["Relocation: Assistance Available", "unknown", "yes"],
    ["Relocation expense coverage to NYC or SF (if needed)", "unknown", "yes"],
    ["Please note that this role would not provide relocation as a result.", "unknown", "no"],
    // refusals of those forms, so that none of them reads a refusal as support
    ["We cannot help you relocate to the UK.", "unknown", "no"],
    ["We are not willing to relocate the right candidate.", "unknown", "no"],
    ["Candidates not willing to relocate to Munich need not apply.", "unknown", "unknown"],
    ["No relocation available.", "unknown", "no"],
    ["Relocation: Assistance not available", "unknown", "no"],
    ["Relocation expense coverage is not available for this role.", "unknown", "no"],
    ["Relocation support can't be provided for this role.", "unknown", "no"],
    ["Relocation assistance unavailable.", "unknown", "no"],
    ["We do not offer relocation assistance.", "unknown", "no"],
    ["Unfortunately, we are unable to offer relocation assistance.", "unknown", "no"],
    ["We cannot offer relocation support.", "unknown", "no"],
    ["This role does not include relocation support.", "unknown", "no"],
    ["We do not assist with relocation.", "unknown", "no"],
    // saying that relocation is not needed is not refusing it
    ["This role does not require relocation.", "unknown", "unknown"],
    // a refusal of one thing does not refuse what a contrasting clause offers
    [
      "We do not offer relocation assistance, but visa sponsorship is available for the right candidate.",
      "yes",
      "no",
    ],
    ["We do not provide relocation, however we sponsor work visas.", "unknown", "no"],
    ["We do not offer relocation or visa sponsorship.", "no", "no"],
    ["We do not offer relocation and visa sponsorship.", "no", "no"],
    // a list of refused items stays a refusal when the visa item is not the first
    ["We do not offer relocation assistance, visa sponsorship, or signing bonuses.", "no", "no"],
    // a relocation refusal never decides visa (ruling R29)
    ["We do not offer relocation assistance, and visa sponsorship is available for all roles.", "yes", "no"],
    ["We cannot offer relocation, and visa sponsorship is available for all roles.", "yes", "no"],
    ["We are unable to offer relocation assistance, and visa sponsorship is available.", "yes", "no"],
    ["We are unable to provide relocation support, and visa sponsorship is available.", "yes", "no"],
    ["We do not offer relocation assistance: visa sponsorship is available for all roles.", "yes", "no"],
    ["We do not offer relocation assistance - visa sponsorship is available for all roles.", "yes", "no"],
    ["We do not offer relocation assistance (visa sponsorship is available).", "yes", "no"],
    ["We cannot provide relocation support, visa sponsorship is available for all roles.", "yes", "no"],
    [
      "Relocation assistance is not available for this position, and visa sponsorship is available for the right candidate.",
      "yes",
      "no",
    ],
    // the object window stops at ", and" and at an object that opens a clause of its own
    ["We do not offer relocation, and visa sponsorship varies by role.", "unknown", "no"],
    ["We cannot provide relocation support, work permits are available.", "unknown", "no"],
    // relocation sponsorship is a relocation matter only
    ["We do not offer relocation sponsorship.", "unknown", "no"],
    ["We cannot provide relocation sponsorship.", "unknown", "no"],
    ["Relocation sponsorship is not available.", "unknown", "no"],
    ["This position is not eligible for relocation sponsorship.", "unknown", "no"],
    ["Relocation sponsorship isn't available for this position.", "unknown", "no"],
    ["Relocation sponsorship is available.", "unknown", "unknown"],
    // the noun guard holds a cue across the commas of a list
    ["We do not fund relocation, visa sponsorship, or work permits.", "unknown", "unknown"],
    // sounds like a visa refusal but is not one
    ["We're unable to offer individual feedback during the interview process.", "unknown", "unknown"],
    ["We participate in E-Verify and confirm work authorization with Form I-9 data.", "unknown", "unknown"],
    [
      "We are unable to consider candidates unwilling to be in Geneva, but we are willing to relocate the right candidate.",
      "unknown",
      "yes",
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
    // ruled to stay unknown
    [
      "However, we aren't able to successfully sponsor visas for every role and every candidate.",
      "unknown",
      "unknown",
    ],
    ["Sponsorship for this role is not guaranteed.", "unknown", "unknown"],
    [
      "This is a fully remote position based in the US East Coast, UK, Germany, France, or Spain, subject to local employment eligibility.",
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
    // contractions the matcher could not read
    ["Visa isn't provided.", "no", "unknown"],
    ["Employment visas aren't sponsored by the company.", "no", "unknown"],
    ["Candidates who require visa sponsorship aren't eligible for this position.", "no", "unknown"],
    // a bare "sponsor", or a comma after the negation, does not make a refusal
    ["Visa sponsorship is not, and never has been, a problem for us.", "unknown", "unknown"],
    ["Visa sponsorship is not, however, guaranteed for every role.", "unknown", "unknown"],
    ["The executive sponsor is not included in the interview loop.", "unknown", "unknown"],
    ["The project sponsor is not permitted to waive the fees.", "unknown", "unknown"],
    ["Sponsorship of the conference is not provided this year.", "unknown", "unknown"],
    // the noun guard: one sentence for each cue and for each guarded noun ("unavailable" is ruling R23)
    ["Visa sponsorship for this role remains unavailable.", "unknown", "unknown"],
    ["We are unable to help with visa sponsorship applications.", "unknown", "unknown"],
    ["We no longer assist with visa sponsorship.", "unknown", "unknown"],
    ["We can't assist with visa sponsorship applications.", "unknown", "unknown"],
    ["We can't help with work permit sponsorship.", "unknown", "unknown"],
    ["We do not supply employment visas.", "unknown", "unknown"],
    ["We can't confirm whether relocation assistance is offered.", "unknown", "unknown"],
    ["No assistance with relocation.", "unknown", "unknown"],
    ["We may not be willing to relocate the right candidate.", "unknown", "unknown"],
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

  it("counts a negation cue only within 40 characters before the verb", () => {
    const near = `We never ${"ab ".repeat(13)}sponsor visas for this role.`;
    const far = `We never ${"ab ".repeat(12)}abc sponsor visas for this role.`;
    const distance = (text: string): number => text.indexOf("sponsor") - (text.indexOf("never") + 5);
    expect(distance(near)).toBe(40);
    expect(distance(far)).toBe(41);
    expect(detectVisa(near)).toBe("unknown");
    expect(detectVisa(far)).toBe("yes");
  });

  it.each([
    "We cannot confirm timing in writing, and we sponsor visas.",
    "We are unable to reply to everyone, but we sponsor visas.",
    "We no longer sponsor visas.",
  ])("does not count a verb that sits behind the cue in: %s", (text) => {
    expect(detectVisa(text)).toBe("unknown");
  });
});
