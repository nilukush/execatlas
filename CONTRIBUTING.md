# Contributing to ExecAtlas

Thanks for helping. This document covers the short version of how to work on this repo.

## Setup

```bash
pnpm install
pnpm ingest:smoke   # quick data pull so pages have something to render
pnpm dev            # http://localhost:4317
```

## Workflow

1. Tests first. Every domain change (roles, locations, enrichment, salary, connectors, dedupe) starts with a failing test in the matching `*.test.ts` file. `pnpm test` must pass before anything is committed.
2. Keep types strict. `npx tsc --noEmit` must be clean; there is no ESLint by design, so the type gate matters.
3. Respect the sources. New connectors only use official or public APIs, one request per second per host, identified User-Agent, cached responses, deep links out. Anything that needs an account, a login wall, or bot protection bypass is rejected.
4. Writing style: plain sentences, no em dashes, no filler. This applies to code comments, docs, and UI copy in all four locales.
5. Salary honesty: estimates are always labeled, missing data shows as missing.

## Adding a connector

1. Add the adapter in `scripts/ingest/connectors/` implementing `run(): Promise<RawJob[]>`.
2. Add a fixture under `scripts/ingest/__fixtures__/` (trimmed real payload) and a test in `connectors.test.ts`.
3. Register it in `scripts/ingest/run.ts`, add its id to `SOURCE_IDS` and `SOURCE_LABELS` in `src/lib/types.ts`, and document its status on the About page table.
4. Update `README.md` and the footer attribution if needed.

## Commits

Conventional style, short subject, for example: `ingest: add workable connector` or `fix(salary): treat bare GCC ranges as monthly`.
