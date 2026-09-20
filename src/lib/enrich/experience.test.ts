import { describe, expect, it } from "vitest";
import { extractExperience } from "./experience";

describe("extractExperience", () => {
  it("reads a plain range of years of experience", () => {
    expect(extractExperience("You bring 8-12 years of experience building platforms.")).toEqual({ min: 8, max: 12 });
  });

  it("reads a range spelled with to and an en dash", () => {
    expect(extractExperience("Requirements: 10 to 15 years' experience in engineering leadership.")).toEqual({ min: 10, max: 15 });
    expect(extractExperience("We expect 8\u201312 years of relevant experience.")).toEqual({ min: 8, max: 12 });
  });

  it("reads a plus-suffixed minimum", () => {
    expect(extractExperience("Candidates need 8+ years of experience leading teams.")).toEqual({ min: 8 });
  });

  it("reads at least and minimum phrasing", () => {
    expect(extractExperience("You have at least 10 years of experience as an engineer.")).toEqual({ min: 10 });
    expect(extractExperience("Minimum of 12 years of experience in product organizations.")).toEqual({ min: 12 });
  });

  it("reads a bare count followed by years of experience", () => {
    expect(extractExperience("The role requires 15 years of experience in software delivery.")).toEqual({ min: 15 });
  });

  it("reads the yrs abbreviation", () => {
    expect(extractExperience("12+ yrs experience in scale-up environments.")).toEqual({ min: 12 });
  });

  it("ignores year counts that are not about experience", () => {
    expect(extractExperience("We are a company founded 3 years ago and growing fast.")).toBeUndefined();
    expect(extractExperience("The team works 3 days a week in the office.")).toBeUndefined();
    expect(extractExperience("Our platform has served customers for 20 years.")).toBeUndefined();
  });

  it("ignores implausible counts", () => {
    expect(extractExperience("Requires 200 years of experience.")).toBeUndefined();
    expect(extractExperience("Bring 0 years of experience and curiosity.")).toBeUndefined();
  });

  it("returns undefined when nothing matches", () => {
    expect(extractExperience("We are hiring a Director of Engineering in Dubai.")).toBeUndefined();
    expect(extractExperience("")).toBeUndefined();
  });

  it("prefers the first plausible match when several appear", () => {
    const text = "8+ years of experience. You will manage people with 5 years of experience each.";
    expect(extractExperience(text)).toEqual({ min: 8 });
  });

  it("accepts requirement lines without the word experience", () => {
    expect(extractExperience("", "10+ years in engineering leadership")).toEqual({ min: 10 });
    expect(extractExperience("", "8-12 years building distributed systems")).toEqual({ min: 8, max: 12 });
  });

  it("still rejects implausible counts in requirement lines", () => {
    expect(extractExperience("", "managing stakeholders for 0 years")).toBeUndefined();
  });

  it("does not let a later sub-qualifier range beat the earlier real minimum", () => {
    // real payload shape: Artefact Director, AI & Agentic Engineering
    const text =
      "You bring a substantial software engineering and AI background with 8+ years of experience, " +
      "including at least 2\u20133 years working on LLM architecture.";
    expect(extractExperience(text)).toEqual({ min: 8 });
  });

  it("does not borrow the word experience from the next sentence", () => {
    // real payload shape: Discord Director of Engineering, Safety
    const text =
      "You have 5+ years as a software engineer with a strong backend and distributed systems background, " +
      "and 5+ years as an EM including 2+ years managing managers. " +
      "Experience running 20+ engineers through multiple EMs is a plus.";
    expect(extractExperience(text)).toBeUndefined();
  });

  it("is safe to call repeatedly on different inputs", () => {
    expect(extractExperience("Requires 8-12 years of experience.")).toEqual({ min: 8, max: 12 });
    expect(extractExperience("Requires 10+ years of experience.")).toEqual({ min: 10 });
    expect(extractExperience("Requires 8-12 years of experience.")).toEqual({ min: 8, max: 12 });
  });
});
