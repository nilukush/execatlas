import fs from "node:fs";
import path from "node:path";
import { dirFor } from "./fix-locale-attrs";
import { routing } from "../src/i18n/routing";
import { getIndexEntries } from "../src/lib/data";
import { defaultOrder, paginate } from "../src/lib/search";
import { STATIC_PATHS } from "../src/app/sitemap";

/**
 * Post-build artifact verification. Every guarantee the fix waves shipped
 * (root meta refresh, localized lang/dir, sitemap math, per-job social and
 * JSON-LD tags, custom 404, service worker integrity) is asserted here so a
 * regression fails the build on any host, Vercel included, instead of
 * shipping silently.
 */

export function expectedSitemapUrlCount(input: {
  jobs: number;
  pageCount: number;
  locales: number;
  staticPaths: number;
}): number {
  const listPages = Math.max(0, input.pageCount - 1);
  return input.locales * (input.staticPaths + listPages + input.jobs);
}

export function indexHasMetaRefresh(html: string): boolean {
  // attribute order and spacing vary legitimately; check both independently
  const tag = html.match(/<meta\b[^>]*>/g)?.find((t) => t.includes('http-equiv="refresh"'));
  return tag !== undefined && /content="0;\s*url=\/en"/.test(tag);
}

export function isLocalizedHtml(html: string, locale: string): boolean {
  const tag = html.match(/<html\b[^>]*>/)?.[0] ?? "";
  return tag.includes(`lang="${locale}"`) && tag.includes(`dir="${dirFor(locale)}"`);
}

function main(): void {
  const outDir = path.join(process.cwd(), "out");
  if (!fs.existsSync(outDir)) {
    console.error("[verify-build] out/ not found; run next build first");
    process.exit(1);
  }
  const problems: string[] = [];
  const read = (rel: string) => fs.readFileSync(path.join(outDir, rel), "utf8");
  const locales = [...routing.locales];

  // 1. the root shell must redirect without JavaScript
  if (!indexHasMetaRefresh(read("index.html"))) {
    problems.push("out/index.html lacks the meta refresh to /en");
  }

  // 2. every locale root carries the right lang/dir in raw HTML
  for (const locale of locales) {
    if (!isLocalizedHtml(read(`${locale}.html`), locale)) {
      problems.push(`out/${locale}.html is not localized (lang/dir)`);
    }
  }

  // 3. sitemap math must match the dataset exactly, with x-default everywhere
  const { jobs: entries } = getIndexEntries();
  const { pageCount } = paginate(defaultOrder(entries), 1);
  const expected = expectedSitemapUrlCount({
    jobs: entries.length,
    pageCount,
    locales: locales.length,
    staticPaths: STATIC_PATHS.length,
  });
  const sitemap = read("sitemap.xml");
  const locs = sitemap.match(/<loc>/g) ?? [];
  if (locs.length !== expected) {
    problems.push(`sitemap has ${locs.length} URLs, expected ${expected}`);
  }
  const xDefault = sitemap.match(/hreflang="x-default"/g) ?? [];
  if (xDefault.length !== locs.length) {
    problems.push(`sitemap x-default count ${xDefault.length} does not match ${locs.length} URLs`);
  }

  // 4. every job detail page exists in every locale
  for (const locale of locales) {
    const jobsDir = path.join(outDir, locale, "jobs");
    if (!fs.existsSync(jobsDir)) {
      problems.push(`${locale}/jobs is missing from out/`);
      continue;
    }
    const files = fs.readdirSync(jobsDir).filter((f) => f.endsWith(".html"));
    if (files.length !== entries.length) {
      problems.push(`${locale}/jobs has ${files.length} pages, expected ${entries.length}`);
    }
  }

  // 5. a sample job page carries the social and structured-data contract
  const sampleId = entries[0]?.id;
  if (sampleId) {
    const page = read(path.join("en", "jobs", `${sampleId}.html`));
    for (const marker of ['property="og:image"', 'name="twitter:card"', '"@type":"JobPosting"', "application/ld+json"]) {
      if (!page.includes(marker)) problems.push(`sample job page missing ${marker}`);
    }
  }

  // 6. the 404 shell is the custom card, not the default Next page
  const notFound = read("404.html");
  if (!notFound.includes('aria-label="ExecAtlas"') || !notFound.includes('href="/ar"')) {
    problems.push("out/404.html is not the custom locale-linking page");
  }

  // 7. the service worker ships verbatim
  const swOut = read("sw.js");
  const swSrc = fs.readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
  if (swOut !== swSrc) problems.push("out/sw.js differs from public/sw.js");

  if (problems.length > 0) {
    for (const problem of problems) console.error(`[verify-build] ${problem}`);
    process.exit(1);
  }
  console.log(`[verify-build] ok: ${expected} sitemap URLs, ${entries.length} job pages x ${locales.length} locales`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? "")) {
  main();
}
