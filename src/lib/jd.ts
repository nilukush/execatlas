import type { JdBlock } from "./types";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  middot: "·",
  bull: "•",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    const key = body.toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[key] ?? match;
  });
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "td", "th", "tr", "table", "dd", "dt", "blockquote", "figcaption",
]);

export interface ParsedPosting {
  blocks: JdBlock[];
  text: string;
  requirements: string[];
}

/**
 * Parses posting HTML into structured blocks without ever rendering raw HTML,
 * so untrusted markup cannot reach the page. Script and style content is
 * stripped entirely; inline tags contribute their text.
 */
export function parsePostingHtml(html: string): ParsedPosting {
  const src = html
    .replace(/<script[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const parts = src.split(/(<[^>]+>)/g).filter((p) => p.length > 0);

  const blocks: JdBlock[] = [];
  let buf = "";
  let headingMode = false;
  let inList = false;

  const pushItem = () => {
    const t = norm(buf);
    buf = "";
    if (!t) return;
    const last = blocks[blocks.length - 1];
    if (inList && last?.type === "list") {
      last.items.push(t);
    } else {
      blocks.push({ type: "list", items: [t] });
      inList = true;
    }
  };

  const flushPara = () => {
    const t = norm(buf);
    buf = "";
    if (!t) return;
    blocks.push({ type: "para", text: t });
  };

  for (const part of parts) {
    if (!part.startsWith("<")) {
      buf += decodeEntities(part);
      continue;
    }
    const tagMatch = part.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)/);
    if (!tagMatch) continue;
    const closing = tagMatch[1] === "/";
    const tag = tagMatch[2].toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      if (closing) {
        const t = norm(buf);
        buf = "";
        if (t) blocks.push({ type: "heading", text: t });
        headingMode = false;
      } else {
        if (headingMode) {
          const t = norm(buf);
          buf = "";
          if (t) blocks.push({ type: "heading", text: t });
        } else {
          flushPara();
        }
        headingMode = true;
      }
    } else if (tag === "li") {
      if (closing) {
        pushItem();
      } else {
        if (!inList) flushPara();
        inList = true;
      }
    } else if (tag === "ul" || tag === "ol") {
      if (closing) {
        pushItem();
        inList = false;
      } else {
        flushPara();
        inList = true;
      }
    } else if (tag === "br") {
      if (headingMode) {
        buf += " ";
      } else {
        flushPara();
      }
    } else if (BLOCK_TAGS.has(tag)) {
      if (headingMode) {
        const t = norm(buf);
        buf = "";
        if (t) blocks.push({ type: "heading", text: t });
        headingMode = false;
      } else {
        flushPara();
      }
    }
    // all other tags are inline and contribute their inner text only
  }

  if (headingMode) {
    const t = norm(buf);
    if (t) blocks.push({ type: "heading", text: t });
  } else if (inList) {
    pushItem();
  } else {
    flushPara();
  }

  return {
    blocks,
    text: blocksToText(blocks),
    requirements: extractRequirements(blocks),
  };
}

function blocksToText(blocks: JdBlock[]): string {
  return blocks
    .map((b) => (b.type === "list" ? b.items.join("\n") : b.text))
    .join("\n");
}

const REQ_HEADING_RE =
  /^(?:requirements?|qualifications?|must[- ]?haves?|what you(?:'ll| will| wi)? ?(?:need|bring)|what we need|who you are|skills?(?: (?:and|&) ?experience)?|experience(?: (?:and|&) ?)? ?(?:skills|qualifications)|your (?:skills|qualifications)|minimum (?:qualifications|requirements)|key (?:requirements|qualifications))\s*[:.]?\s*$/i;

function isRequirementHeading(heading: string): boolean {
  return REQ_HEADING_RE.test(norm(heading).replace(/[:.]+$/, ""));
}

/** Requirement lines following a requirements-style heading, until the next heading. */
function extractRequirements(blocks: JdBlock[]): string[] {
  const headingIndex = blocks.findIndex(
    (b) => b.type === "heading" && isRequirementHeading(b.text)
  );
  if (headingIndex === -1) return [];

  const lines: string[] = [];
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "heading") break;
    if (block.type === "list") lines.push(...block.items);
    else lines.push(block.text);
  }
  return lines;
}
