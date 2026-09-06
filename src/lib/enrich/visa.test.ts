import { describe, expect, it } from "vitest";
import { detectVisa } from "./visa";

describe("detectVisa", () => {
  const cases: Array<[string, "yes" | "no" | "unknown"]> = [
    // sponsorship offered
    ["We offer visa sponsorship for the right candidate.", "yes"],
    ["Visa sponsorship available for this role.", "yes"],
    ["We sponsor work visas and provide relocation support.", "yes"],
    ["Relocation assistance provided.", "yes"],
    ["The company will sponsor an employment visa.", "yes"],
    ["We provide visa and work permit sponsorship.", "yes"],
    ["Assistance with visa applications is available.", "yes"],
    // sponsorship refused
    ["Applicants must have existing right to work in the UAE.", "no"],
    ["Candidates must have valid work authorization in the Kingdom.", "no"],
    ["No visa sponsorship available for this position.", "no"],
    ["We are unable to offer visa sponsorship.", "no"],
    ["This role does not offer visa sponsorship.", "no"],
    ["You must already hold a work permit.", "no"],
    ["Applicants must hold their own right to work.", "no"],
    ["This position is not eligible for sponsorship.", "no"],
    // nothing said
    ["We are looking for a hands-on engineering leader in Dubai.", "unknown"],
    ["You will lead five teams across three products.", "unknown"],
    ["", "unknown"],
  ];

  it.each(cases)('"%s" -> %s', (text, expected) => {
    expect(detectVisa(text)).toBe(expected);
  });

  it("treats explicit refusals as no even when generic sponsor language appears elsewhere", () => {
    const mixed =
      "We sponsor visas for some positions. For this one, candidates must already have the right to work in the UK.";
    expect(detectVisa(mixed)).toBe("no");
  });
});
