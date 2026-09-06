import { describe, expect, it } from "vitest";
import { parsePostingHtml } from "./jd";

describe("parsePostingHtml", () => {
  it("parses headings, paragraphs and lists into blocks", () => {
    const result = parsePostingHtml(
      "<h2>About the role</h2><p>We build payments software.</p><ul><li>Lead 5 teams</li><li>Own the platform</li></ul>"
    );
    expect(result.blocks).toEqual([
      { type: "heading", text: "About the role" },
      { type: "para", text: "We build payments software." },
      { type: "list", items: ["Lead 5 teams", "Own the platform"] },
    ]);
  });

  it("decodes common HTML entities", () => {
    const result = parsePostingHtml("<p>Research &amp; development&#39;s mission</p>");
    expect(result.blocks[0]).toEqual({ type: "para", text: "Research & development's mission" });
  });

  it("never lets script or style content reach the output", () => {
    const result = parsePostingHtml(
      "<p>Safe.</p><script>alert('xss')</script><style>.x{color:red}</style><p>End.</p>"
    );
    expect(result.text).not.toContain("alert");
    expect(result.text).not.toContain("color");
    expect(result.blocks.map((b) => b.type)).toEqual(["para", "para"]);
  });

  it("extracts the requirements section that follows a requirements-style heading", () => {
    const html = [
      "<h2>About the role</h2><p>Great team.</p>",
      "<h3>Requirements</h3><ul><li>12+ years engineering leadership</li><li>Visa sponsorship available</li></ul>",
      "<h3>What we offer</h3><p>Training budget.</p>",
    ].join("");
    const result = parsePostingHtml(html);
    expect(result.requirements).toEqual([
      "12+ years engineering leadership",
      "Visa sponsorship available",
    ]);
  });

  it("recognizes alternative requirement headings", () => {
    const a = parsePostingHtml("<h3>What you&#x27;ll need</h3><p>10 years of experience.</p><h3>Benefits</h3><p>Gym.</p>");
    expect(a.requirements).toEqual(["10 years of experience."]);

    const b = parsePostingHtml("<h2>Qualifications</h2><p>Scale experience.</p><h2>Responsibilities</h2><p>Own roadmap.</p>");
    expect(b.requirements).toEqual(["Scale experience."]);
  });

  it("produces plain text for search", () => {
    const result = parsePostingHtml("<h2>Role</h2><p>Line one.</p><ul><li>Item</li></ul>");
    expect(result.text).toBe("Role\nLine one.\nItem");
  });

  it("survives messy real-world markup", () => {
    const result = parsePostingHtml(
      '<div><p><strong>Director</strong> of Engineering &ndash; Dubai<br/>Hybrid role.</p><p><em>Apply today.</em></p></div>'
    );
    expect(result.text).toContain("Director of Engineering – Dubai");
    expect(result.text).toContain("Hybrid role.");
  });
});
