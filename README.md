# ExecAtlas

Senior engineering leadership jobs, worldwide. Live at https://execatlas.vercel.app (Vercel free tier, rebuilt automatically whenever the dataset refreshes). ExecAtlas aggregates Director, AVP, VP, Head of and CTO level roles from official and public job APIs across India, the Middle East, Southeast Asia, North Africa, Europe and North America, then enriches every posting with the things international candidates actually need:

- Visa sponsorship signal, read from each posting (sponsors / does not sponsor / unspecified)
- The real apply link, pointing at the employer's own posting
- Requirements extracted from the description and shown first
- Commute type (remote, hybrid with office days, on-site) and role type (permanent, contract, freelance, temporary, part-time, interim)
- Salary: the stated range when the posting includes one, otherwise an estimated P25 to P75 band in the local currency of the job's country, built on the ExpatRate benchmark dataset (https://expatrate.pages.dev)
- Filters (region, country, seniority, visa, work mode, role type, source), search, sorting and pagination
- Ask a question in plain language ("is there a VP Engineering role in Dubai with visa sponsorship?") and get a yes or no with counts, the filters it understood, and when nothing matches, the closest relaxation that does
- Saved searches on your device with a count of new roles since you last looked; no account needed
- Crawlable static list pages under /jobs/page/2 and beyond, plus JSON-LD JobPosting sitemap coverage
- Four languages: English (default), Hindi, Arabic (full RTL), Bahasa Indonesia
- Installable PWA, static rendering for fast loads and clean SEO, JSON-LD JobPosting markup on every role

## Quickstart

Requirements: Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm ingest        # fetch from live sources into data/generated/ (~5 minutes, rate limited)
pnpm dev           # http://localhost:4317
```

Other commands:

```bash
pnpm test          # vitest unit and component tests
pnpm build         # static production build into out/
pnpm ingest:smoke  # quick single-board ingestion dry run
```

The site reads `data/generated/*.json` at build time, so it renders even offline after one successful ingest. The generated dataset is committed, so a fresh clone builds without re-ingesting.

## Where the jobs come from

| Source | Access | Status |
| --- | --- | --- |
| Greenhouse | Official public Job Board API (no auth) | Active. 119 verified company boards |
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
                       data access
  data/salary/         vendored ExpatRate benchmark subset (CC BY 4.0)
  messages/            translation catalogs
scripts/
  ingest/              connectors (greenhouse, workable, arbeitnow, jobicy),
                       normalizer, dedupe, polite HTTP client, pipeline CLI
data/generated/        committed build-time dataset (jobs, index, stats, queries)
```

## Refreshing data

Run `pnpm ingest` and commit the updated `data/generated/` files. Two GitHub Actions workflows ship in `.github/workflows/`: CI (tests, typecheck, build) on every push and pull request, and a scheduled daily ingest that commits the refreshed dataset automatically. Both activate once the repository is pushed to GitHub. Rebuilds pick up the fresh dataset automatically.

## Roadmap

- Periodically repeat the Greenhouse board discovery sweep (several newly added boards have large non-leadership pools that will yield leadership roles over time)
- Push alerts for saved searches, only if a hosting or backend story ever appears
- Connectors for any source that opens an official access path

## License

Code: MIT (see LICENSE). Salary benchmark data: CC BY 4.0 via ExpatRate, with attribution kept in the site footer and on every job page. Job listings belong to their publishers; ExecAtlas links out to them.
