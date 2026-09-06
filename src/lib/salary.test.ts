import { describe, expect, it } from "vitest";
import {
  parseStatedSalary,
  estimateSalary,
  formatSalaryBand,
  monthsPerYear,
} from "./salary";

describe("parseStatedSalary", () => {
  const cases: Array<
    [string, { min: number; max: number; currency: string; period: "annual" | "monthly" } | null]
  > = [
    ["Salary: $200,000 - $250,000 per year", { min: 200000, max: 250000, currency: "USD", period: "annual" }],
    ["$200k-$250k", { min: 200000, max: 250000, currency: "USD", period: "annual" }],
    ["We pay £120,000 to £140,000.", { min: 120000, max: 140000, currency: "GBP", period: "annual" }],
    ["AED 45,000 - 60,000 per month", { min: 45000, max: 60000, currency: "AED", period: "monthly" }],
    ["AED 45,000 - 60,000", { min: 45000, max: 60000, currency: "AED", period: "monthly" }],
    ["QAR 50,000 to QAR 65,000 monthly", { min: 50000, max: 65000, currency: "QAR", period: "monthly" }],
    ["SGD 18,000 - 25,000 monthly", { min: 18000, max: 25000, currency: "SGD", period: "monthly" }],
    ["€90,000/year", { min: 90000, max: 90000, currency: "EUR", period: "annual" }],
    ["Compensation range: €100,000 – €140,000", { min: 100000, max: 140000, currency: "EUR", period: "annual" }],
    ["₹ 80,00,000 - 1,20,00,000 P.A.", { min: 8000000, max: 12000000, currency: "INR", period: "annual" }],
    ["₹80 LPA to ₹120 LPA", { min: 8000000, max: 12000000, currency: "INR", period: "annual" }],
    ["Competitive salary", null],
    ["You will manage 5-10 engineers across two locations.", null],
    ["10+ years of experience required.", null],
  ];

  it.each(cases)('"%s"', (text, expected) => {
    expect(parseStatedSalary(text)).toEqual(expected);
  });

  it("returns a single value as both min and max", () => {
    expect(parseStatedSalary("The salary is £150,000 per annum.")).toEqual({
      min: 150000,
      max: 150000,
      currency: "GBP",
      period: "annual",
    });
  });
});

describe("estimateSalary (real vendored ExpatRate rows)", () => {
  it("estimates a UAE executive band in AED, annualized from monthly", () => {
    // it-executive/executive ARE: 55000 / 67500 / 90000 monthly-gross AED
    expect(estimateSalary("ARE", "engineering")).toEqual({
      min: 660000,
      max: 1080000,
      currency: "AED",
      period: "annual",
      source: "estimated",
      quality: "Medium",
      familyUsed: "it-executive",
    });
  });

  it("estimates India in INR straight from an annual row", () => {
    // it-executive/executive IND: 5000000 / 10000000 / 15000000 annual-gross INR
    expect(estimateSalary("IND", "engineering")).toEqual({
      min: 5000000,
      max: 15000000,
      currency: "INR",
      period: "annual",
      source: "estimated",
      familyUsed: "it-executive",
      quality: expect.any(String),
    });
  });

  it("uses the product-pairing chain for engineering-product domain", () => {
    expect(estimateSalary("DEU", "engineering-product")?.familyUsed).toBe("it-executive");
  });

  it("annualizes the Philippines over 13 months per local convention", () => {
    const band = estimateSalary("PHL", "engineering");
    expect(band).not.toBeNull();
    // it-executive/executive PHL: 458333 / 645000 / 866667 monthly-gross PHP
    expect(band?.min).toBe(458333 * 13);
    expect(band?.currency).toBe("PHP");
  });

  it("returns null instead of inventing a number for uncovered countries", () => {
    expect(estimateSalary("YEM", "engineering")).toBeNull();
    expect(estimateSalary("BHR", "engineering")).toBeNull();
  });

  it("collapses partial bands to the median", () => {
    const synthetic = [
      { f: "it-executive", l: "executive", c: "ZZZ", currency: "ZZZ", b: "annual-gross", p25: 0, p50: 100, p75: 0, q: "Low" },
    ];
    expect(estimateSalary("ZZZ", "engineering", synthetic)).toEqual({
      min: 100,
      max: 100,
      currency: "ZZZ",
      period: "annual",
      source: "estimated",
      quality: "Low",
      familyUsed: "it-executive",
    });
  });
});

describe("monthsPerYear", () => {
  it("applies the 13th month and THR conventions", () => {
    expect(monthsPerYear("PHL")).toBe(13);
    expect(monthsPerYear("IDN")).toBe(13);
    expect(monthsPerYear("ARE")).toBe(12);
  });
});

describe("formatSalaryBand", () => {
  it("formats ranges without fractions in the requested locale", () => {
    expect(
      formatSalaryBand({ min: 660000, max: 1080000, currency: "AED", period: "annual", source: "estimated" }, "en")
    ).toBe("AED 660,000 to AED 1,080,000");
  });

  it("uses lakh grouping for Hindi", () => {
    expect(
      formatSalaryBand({ min: 5000000, max: 15000000, currency: "INR", period: "annual", source: "estimated" }, "hi")
    ).toBe("₹50,00,000 to ₹1,50,00,000");
  });
});
