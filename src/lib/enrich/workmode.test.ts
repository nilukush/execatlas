import { describe, expect, it } from "vitest";
import { detectWorkMode } from "./workmode";

describe("detectWorkMode", () => {
  const cases: Array<
    [string, { mode: string; officeDays?: number }, boolean?]
  > = [
    ["This is a hybrid role with 3 days per week in our Dubai office.", { mode: "hybrid", officeDays: 3 }],
    ["Hybrid working: 2 days a week in office.", { mode: "hybrid", officeDays: 2 }],
    ["Hybrid - 3 days from office.", { mode: "hybrid", officeDays: 3 }],
    ["4 days in office per week.", { mode: "hybrid", officeDays: 4 }],
    ["We work hybrid.", { mode: "hybrid" }],
    ["Fully remote position.", { mode: "remote" }],
    ["This role is remote-friendly.", { mode: "remote" }],
    ["Work from home forever.", { mode: "remote" }],
    ["Remote-first team across Europe.", { mode: "remote" }],
    ["The role is based on-site in Riyadh.", { mode: "onsite" }],
    ["Office-based role in Berlin.", { mode: "onsite" }],
    ["You will work from office five days a week.", { mode: "onsite" }],
    ["Fully onsite in our Singapore HQ.", { mode: "onsite" }],
    ["We build software for banks.", { mode: "unspecified" }],
    // hybrid wins over a passing mention of remote
    ["Hybrid role (2 days remote, rest in office).", { mode: "hybrid" }],
    // days-in-office pattern wins over onsite wording
    ["Onsite-first culture, 3 days a week in the office.", { mode: "hybrid", officeDays: 3 }],
  ];

  it.each(cases)('"%s"', (text, expected) => {
    expect(detectWorkMode(text)).toEqual(expected);
  });

  it("falls back to a source-provided remote hint when the text says nothing", () => {
    expect(detectWorkMode("Exciting opportunity.", true)).toEqual({ mode: "remote" });
    expect(detectWorkMode("Exciting opportunity.", false)).toEqual({ mode: "unspecified" });
  });

  it("ignores absurd day counts outside one to five", () => {
    expect(detectWorkMode("Hybrid with 7 days a week in office.")).toEqual({ mode: "hybrid" });
  });
});
