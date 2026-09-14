# ExecAtlas

Senior engineering leadership jobs, worldwide. Live at https://execatlas.vercel.app (Vercel free tier, rebuilt automatically whenever the dataset refreshes). ExecAtlas aggregates Director, AVP, VP, Head of and CTO level roles from official and public job APIs across India, the Middle East, Southeast Asia, North Africa, Europe and North America, then enriches every posting with the things international candidates actually need:

- Visa sponsorship signal, read from each posting (sponsors / does not sponsor / unspecified)
- The real apply link, pointing at the employer's own posting
- Requirements extracted from the description and shown first
- Commute type (remote, hybrid with office days, on-site) and role type (permanent, contract, freelance, temporary, part-time, full-time, interim)
- Salary: the stated range when the posting includes one, otherwise an estimated P25 to P75 band in the local currency of the job's country, built on the ExpatRate benchmark dataset (https://expatrate.pages.dev)
- Filters (region, country, seniority, visa, work mode, role type, source), sorting and pagination; on phones the filters fold behind one button with an active count
- One search box for questions and keywords alike: ask "is there a VP Engineering role in Dubai with visa sponsorship?" and get a yes or no with counts, the filters it understood, and when nothing matches, the closest relaxation that does
- Saved searches on your device with a count of new roles since you last looked; no account needed
- Crawlable static list pages under /jobs/page/2 and beyond, a sitemap with per-job dates and hreflang including x-default, and JSON-LD JobPosting markup on every role
- Four languages: English (default), Hindi, Arabic (full RTL), Bahasa Indonesia
- Installable PWA, static rendering for fast loads and clean SEO, and a proper share card (title, summary and image) when a role link is sent to someone

## Quickstart

Requirements: Node 20.11+ (CI and Vercel run 24) and pnpm 10+.

```bash
pnpm install
pnpm ingest        # fetch from live sources into data/generated/ (~5 minutes, rate limited)
pnpm dev           # http://localhost:4317
```

Other commands:

```bash
pnpm test               # vitest unit and component tests
npx tsc --noEmit        # type gate, must be clean
pnpm build              # static production build into out/, then artifact checks
pnpm ingest:smoke       # single-board connectivity check; overwrites the
                       # committed dataset, so re-run a full ingest afterwards
```

The site reads `data/generated/*.json` at build time, so it renders even offline after one successful ingest. The generated dataset is committed, so a fresh clone builds without re-ingesting.

## Where the jobs come from

| Source | Access | Status |
| --- | --- | --- |
| Greenhouse | Official public Job Board API (no auth) | Active. 134 verified company boards |
| Workable | Public search endpoint used by their own frontend | Active, rate limited and cached |
| Arbeitnow | Free public job board API | Active |
| Jobicy | Public API v2 | Active |
| LinkedIn, Indeed, Naukri, Naukrigulf, GulfTalent | No public jobs API; terms prohibit automated collection | Not used |

The five unused sources have no compliant free access path. Scraping them, or building tooling to get around their bot protection, is out of scope for this project. Many employers post the same roles on their own Greenhouse or Workable boards, which recovers a real share of that inventory legitimately. The About page explains this to visitors as well.

Ingestion etiquette: identified User-Agent, roughly one request per second per host, disk cache with TTL, deep links back to the original posting.

## Salary estimates

Stated ranges always win. When a posting hides the number, the estimator looks up the ExpatRate benchmark band for the country and role family, normalizes monthly to annual (13 months for the Philippines and Indonesia per local convention), and labels the result as an estimate with its data quality. Countries without benchmark coverage show no estimate rather than an invented number. Benchmark dataset: CC BY 4.0. Code: MIT.

## Project structure

```
src/
  app/[locale]/        pages: home, jobs list, job detail, about (en, hi, ar, id)
  components/          header, footer, job card, jobs browser (client island)
  lib/                 domain logic: roles matrix, locations, enrichment,
                       salary parsing and estimation, job description parser,
                       search, ask-a-question answering, saved searches,
                       and versioned fail-closed data access
  data/salary/         vendored ExpatRate benchmark subset (CC BY 4.0)
  messages/            translation catalogs
scripts/
  ingest/              connectors (greenhouse, workable, arbeitnow, jobicy),
                       normalizer, dedupe, polite cached HTTP client, dataset
                       sanity gates, atomic writes, pipeline CLI
  fix-locale-attrs.ts  post-build: bakes lang/dir into every locale page
  verify-build.ts      post-build: asserts the artifact contract or fails
data/generated/        committed build-time dataset (jobs, index, stats, queries)
```

## Refreshing data

Run `pnpm ingest` and commit the updated `data/generated/` files. A scheduled GitHub Actions workflow does exactly that every night: it ingests, aborts if the dataset collapses below half its previous size (a blocked source or a changed API shape, with a manual override flag), then runs the type check, the test suite and a full build before the bot commits, so a bad night cannot ship. Nights with no data changes skip the commit entirely. CI runs the same checks on every push and pull request, and every build (local, CI, Vercel) ends by verifying its own output: sitemap counts against the dataset, locale attributes, redirect shell, structured data, the works.

## Roadmap

- Periodically repeat the Greenhouse board discovery sweep (several newly added boards have large non-leadership pools that will yield leadership roles over time)
- Scale work as the dataset grows past about 1000 roles: ship a compact index to the browser instead of the full one, and shard the sitemap
- Push alerts for saved searches, only if a hosting or backend story ever appears
- Connectors for any source that opens an official access path

## License

Code: MIT (see LICENSE). Salary benchmark data: CC BY 4.0 via ExpatRate, with attribution kept in the site footer and on every job page. Job listings belong to their publishers; ExecAtlas links out to them.
