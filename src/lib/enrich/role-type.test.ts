import { describe, expect, it } from "vitest";
import { detectRoleType } from "./role-type";

describe("detectRoleType", () => {
  it("maps structured hints from sources first", () => {
    expect(detectRoleType("Some long JD text.", "Full-time")).toBe("full-time");
    expect(detectRoleType("Some long JD text.", "Contract")).toBe("contract");
    expect(detectRoleType("Some long JD text.", "Permanent")).toBe("permanent");
    expect(detectRoleType("Some long JD text.", null)).toBe(null);
  });

  const cases: Array<[string, string | null]> = [
    ["This is a 12-month fixed term contract.", "contract"],
    ["Permanent position with benefits.", "permanent"],
    ["Freelance engagement for six months.", "freelance"],
    ["Temporary cover during parental leave.", "temporary"],
    ["This is a part-time role (20 hours).", "part-time"],
    ["Interim CTO for a scaling fintech.", "interim"],
    ["Full-time, permanent employee.", "permanent"],
    ["Contract to hire after six months.", "contract"],
    ["We are hiring an engineering director.", null],
  ];

  it.each(cases)('"%s" -> %s', (text, expected) => {
    expect(detectRoleType(text)).toBe(expected);
  });
});
