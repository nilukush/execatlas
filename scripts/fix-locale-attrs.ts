import fs from "node:fs";
import path from "node:path";
import { routing } from "../src/i18n/routing";

/**
 * The app router owns <html> in one root layout, so a statically exported
 * site ships lang="en" dir="ltr" for every locale; an inline script corrects
 * it before paint but crawlers, HTML parsers, and screen readers without
 * JavaScript still read the wrong language and direction. This post-build
 * step rewrites the attributes in the emitted HTML for each locale tree.
 */

const LOCALES = new Set<string>(routing.locales);
const RTL_LOCALES = new Set(["ar"]);

export function dirFor(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function localizeHtmlAttrs(html: string, locale: string): string {
  if (locale === "en" || !LOCALES.has(locale)) return html;
  const dir = dirFor(locale);
  return html.replace(/<html\b[^>]*>/, (tag) =>
    tag.replace('lang="en"', `lang="${locale}"`).replace('dir="ltr"', `dir="${dir}"`)
  );
}

/** True when the html tag already carries the locale's attributes; a drifted
 * build shape must fail the step instead of silently shipping en/ltr. */
export function isLocalized(html: string, locale: string): boolean {
  const tag = html.match(/<html\b[^>]*>/)?.[0] ?? "";
  return tag.includes(`lang="${locale}"`) && tag.includes(`dir="${dirFor(locale)}"`);
}

/** Locale of an output path like out/ar/jobs/x.html or out/hi.html; null when none applies. */
export function localeForPath(file: string): string | null {
  const rel = path.relative(path.join(process.cwd(), "out"), file);
  if (rel.startsWith("..")) return null;
  const first = rel.split(path.sep)[0];
  const locale = first.replace(/\.html$/, "");
  return LOCALES.has(locale) ? locale : null;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

function main() {
  const outDir = path.join(process.cwd(), "out");
  if (!fs.existsSync(outDir)) {
    console.error("[fix-locale-attrs] out/ not found; run next build first");
    process.exit(1);
  }
  let rewritten = 0;
  for (const file of walk(outDir)) {
    const locale = localeForPath(file);
    if (!locale || locale === "en") continue;
    const html = fs.readFileSync(file, "utf8");
    const fixed = localizeHtmlAttrs(html, locale);
    if (!isLocalized(fixed, locale)) {
      console.error(`[fix-locale-attrs] could not localize ${file}; html tag shape drifted`);
      process.exit(1);
    }
    if (fixed !== html) {
      fs.writeFileSync(file, fixed);
      rewritten += 1;
    }
  }
  console.log(`[fix-locale-attrs] localized html attributes in ${rewritten} files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename ?? "")) {
  main();
}
