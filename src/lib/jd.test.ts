import { describe, expect, it } from "vitest";
import { parsePostingHtml } from "./jd";

describe("requirement heading variants (issue 2)", () => {
  it("extracts requirements under 'Your skills and experience'", () => {
    const parsed = parsePostingHtml(
      "<h2>About</h2><p>Intro.</p>" +
        "<h2>Your skills and experience</h2><p>Ten years in consulting.</p><ul><li>Leadership.</li></ul>" +
        "<h2>Benefits</h2><p>Perks.</p>"
    );
    expect(parsed.requirements).toEqual(["Ten years in consulting.", "Leadership."]);
  });

  it("extracts requirements under 'What we're looking for'", () => {
    const parsed = parsePostingHtml(
      "<h3>What we're looking for</h3><p>Scale experience.</p><h3>Our offer</h3><p>Pay.</p>"
    );
    expect(parsed.requirements).toEqual(["Scale experience."]);
  });

  it("accepts typographic apostrophes in contraction headings", () => {
    // boards overwhelmingly post curly quotes, often entity-encoded
    const parsed = parsePostingHtml(
      "<h3>What we&rsquo;re looking for</h3><p>Scale experience.</p>" +
        "<h3>Who we&rsquo;re looking for</h3><p>Depth.</p><h3>Offer</h3><p>Pay.</p>"
    );
    expect(parsed.requirements).toEqual(["Scale experience."]);
  });

  it("extracts requirements under 'Who we are looking for'", () => {
    const parsed = parsePostingHtml(
      "<h2>Who we are looking for</h2><p>Product leadership.</p><h2>Team</h2><p>Us.</p>"
    );
    expect(parsed.requirements).toEqual(["Product leadership."]);
  });
});

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

  it("structures fully entity-encoded posting HTML the way Greenhouse delivers it", () => {
    const encoded = [
      "&lt;h2&gt;About the role&lt;/h2&gt;",
      "&lt;p&gt;We build payments software.&amp;nbsp;Apply now.&lt;/p&gt;",
      "&lt;ul&gt;&lt;li&gt;Lead 5 teams&lt;/li&gt;&lt;li&gt;Own the platform&lt;/li&gt;&lt;/ul&gt;",
    ].join("");
    const result = parsePostingHtml(encoded);
    expect(result.blocks).toEqual([
      { type: "heading", text: "About the role" },
      { type: "para", text: "We build payments software. Apply now." },
      { type: "list", items: ["Lead 5 teams", "Own the platform"] },
    ]);
    expect(result.text).not.toContain("<");
  });

  it("strips script content delivered as entities", () => {
    const encoded = "&lt;p&gt;Safe.&lt;/p&gt;&lt;script&gt;alert('xss')&lt;/script&gt;&lt;p&gt;End.&lt;/p&gt;";
    const result = parsePostingHtml(encoded);
    expect(result.text).not.toContain("alert");
    expect(result.blocks.map((b) => b.type)).toEqual(["para", "para"]);
  });

  it("extracts requirements from entity-encoded postings", () => {
    const encoded =
      "&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;12+ years engineering leadership&lt;/li&gt;&lt;li&gt;Visa sponsorship available&lt;/li&gt;&lt;/ul&gt;";
    expect(parsePostingHtml(encoded).requirements).toEqual([
      "12+ years engineering leadership",
      "Visa sponsorship available",
    ]);
  });

  it("keeps a literal angle bracket in text out of tag parsing", () => {
    const result = parsePostingHtml("<p>Salary &lt; 100k and equity &gt; shares</p>");
    expect(result.blocks[0]).toEqual({ type: "para", text: "Salary < 100k and equity > shares" });
  });

  it("cuts an unterminated script tag to the end of input", () => {
    const result = parsePostingHtml("<p>Safe.</p><script>alert('x')");
    expect(result.text).not.toContain("alert");
    expect(result.blocks.map((b) => b.type)).toEqual(["para"]);
  });

  it("keeps an out-of-range numeric character reference from throwing", () => {
    const result = parsePostingHtml("<p>Bad &#x110000; reference</p>");
    expect(result.blocks[0]).toEqual({ type: "para", text: "Bad &#x110000; reference" });
  });
});
