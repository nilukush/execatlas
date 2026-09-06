// Vendors a filtered subset of the ExpatRate salary dataset into this project.
// The source repo at /Users/nileshkumar/gh/expat-salary is READ-ONLY: we only read from it here.
// Dataset license: CC BY 4.0 (attribution kept in the emitted meta block and the site footer).
import fs from "node:fs";
import path from "node:path";

const SRC = "/Users/nileshkumar/gh/expat-salary/src/data";
const OUT = path.join(process.cwd(), "src", "data", "salary");
const FAMILIES = ["it-executive", "software-engineering", "product-management", "data-and-ai"];

const benchmarks = JSON.parse(fs.readFileSync(path.join(SRC, "benchmarks.json"), "utf8"));
const rows = benchmarks.entries
  .filter((e) => FAMILIES.includes(e.family) && !e.status)
  .map((e) => ({
    f: e.family,
    l: e.level,
    c: e.country,
    currency: e.currency,
    b: e.basis,
    p25: e.p25,
    p50: e.p50,
    p75: e.p75,
    q: e.quality,
  }));

fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(
  path.join(OUT, "benchmarks.json"),
  JSON.stringify({
    meta: {
      source:
        "ExpatRate benchmark dataset (https://expatrate.pages.dev), subset vendored 2026-09-06. License CC BY 4.0. Curated by Nilesh Kumar; curation log and full dataset live in the expat-salary repository.",
      families: FAMILIES,
      rows: rows.length,
    },
    rows,
  })
);

const fx = JSON.parse(fs.readFileSync(path.join(SRC, "fx-snapshot.json"), "utf8"));
fs.writeFileSync(path.join(OUT, "fx.json"), JSON.stringify({ base: fx.base, asOf: fx.asOf, rates: fx.rates }));

const conv = JSON.parse(fs.readFileSync(path.join(SRC, "employment-conventions.json"), "utf8"));
fs.writeFileSync(
  path.join(OUT, "conventions.json"),
  JSON.stringify({
    defaultMonthsPerYear: conv.defaultMonthsPerYear,
    thirteenthMonth: conv.countryOverrides.filter((o) => o.thirteenthMonthMandatory).map((o) => o.country),
    thr: conv.countryOverrides.filter((o) => o.religiousAllowanceTHR).map((o) => o.country),
  })
);

const countries = JSON.parse(fs.readFileSync(path.join(SRC, "countries.json"), "utf8"));
fs.writeFileSync(path.join(OUT, "countries.json"), JSON.stringify(countries));

console.log(`Vendored ${rows.length} benchmark rows, ${countries.length} countries, fx asOf ${fx.asOf}`);
