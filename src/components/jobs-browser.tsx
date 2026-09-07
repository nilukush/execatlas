"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { IndexEntry } from "@/lib/types";
import { COUNTRIES, REGIONS } from "@/lib/locations";
import { SOURCE_LABELS, type SourceId } from "@/lib/types";
import { applyFilters, DEFAULT_FILTERS, paginate, type JobFilters } from "@/lib/search";
import { answerQuestion, intentFilters, type AskAnswer, type AskSuggestion, type QuestionIntent } from "@/lib/ask";
import {
  createSavedSearch,
  markSeen,
  newMatches,
  parseSavedSearches,
  serializeSavedSearches,
  type SavedSearch,
} from "@/lib/saved-searches";
import { formatDate } from "@/lib/seo";
import { JobCard, type JobCardLabels } from "./job-card";

const SENIORITIES = ["cto", "vp", "avp", "director", "head"] as const;
const ROLE_TYPES = ["permanent", "contract", "freelance", "temporary", "part-time", "full-time", "interim"] as const;
const STORAGE_KEY = "ea-saved-searches";
const MAX_SAVED = 8;

export function JobsBrowser({ entries, locale }: { entries: IndexEntry[]; locale: string }) {
  const t = useTranslations("Jobs");
  const tJob = useTranslations("Job");
  const tRoles = useTranslations("Roles");
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      setSaved(parseSavedSearches(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      // private mode or blocked storage: saved searches stay disabled
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeSavedSearches(saved));
    } catch {
      // ignore write failures; the in-memory list still works for this visit
    }
  }, [saved, storageReady]);

  const filtered = useMemo(() => applyFilters(entries, filters), [entries, filters]);
  const { slice, pageCount } = useMemo(() => paginate(filtered, page), [filtered, page]);

  const countryOptions = useMemo(() => {
    const list =
      filters.region === "all" || filters.region === "remote"
        ? COUNTRIES
        : COUNTRIES.filter((c) => c.region === filters.region);
    return list;
  }, [filters.region]);

  function update(patch: Partial<JobFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
    // manual filter changes invalidate the answer panel; ask() and the
    // suggestion/saved appliers set a fresh answer right after their update()
    setAnswer(null);
  }

  function intentFromFilters(f: JobFilters): QuestionIntent {
    return {
      query: f.query,
      seniority: f.seniority as QuestionIntent["seniority"],
      region: f.region as QuestionIntent["region"],
      country: f.country,
      visa: f.visa === "yes" ? "yes" : "all",
      workMode: f.workMode,
    };
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    const a = answerQuestion(q, entries);
    update({
      query: a.intent.query,
      seniority: a.intent.seniority,
      region: a.intent.region,
      country: a.intent.country,
      visa: a.intent.visa,
      workMode: a.intent.workMode,
    });
    setAnswer(a);
  }

  function applySuggestion() {
    const s = answer?.suggestion;
    if (!s) return;
    update({
      query: s.intent.query,
      seniority: s.intent.seniority,
      region: s.intent.region,
      country: s.intent.country,
      visa: s.intent.visa,
      workMode: s.intent.workMode,
    });
    const matches = applyFilters(entries, intentFilters(s.intent));
    setAnswer({
      yes: true,
      count: matches.length,
      total: entries.length,
      top: matches.slice(0, 3),
      intent: s.intent,
    });
  }

  function filterLabel(dropped: AskSuggestion["dropped"]): string {
    switch (dropped) {
      case "visa":
        return t("visa");
      case "location":
        return answer && answer.intent.country !== "all" ? t("country") : t("region");
      case "seniority":
        return t("seniority");
      case "workMode":
        return t("workMode");
      case "query":
        return t("askFilterQuery");
    }
  }

  function chipsFor(i: QuestionIntent): string[] {
    const chips: string[] = [];
    if (i.query) chips.push(i.query);
    if (i.seniority !== "all") chips.push(tRoles(i.seniority));
    if (i.country !== "all") {
      chips.push(COUNTRIES.find((c) => c.iso2 === i.country)?.name ?? i.country);
    } else if (i.region !== "all") {
      chips.push(REGIONS.find((r) => r.id === i.region)?.label ?? i.region);
    }
    if (i.visa === "yes") chips.push(t("visaYes"));
    if (i.workMode !== "all") chips.push(t(i.workMode));
    return chips;
  }

  const answerChips = answer ? chipsFor(answer.intent) : [];

  const newCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of saved) counts[s.id] = newMatches(s, entries).length;
    return counts;
  }, [saved, entries]);

  function saveCurrent() {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s${Date.now()}`;
    // save exactly what is on screen: the full filter state, question text as label
    const created = markSeen(createSavedSearch(question.trim(), { ...filters }, id), entries);
    setSaved((prev) => [created, ...prev.filter((s) => s.id !== id)].slice(0, MAX_SAVED));
  }

  function applySaved(s: SavedSearch) {
    setFilters({ ...s.filters });
    setPage(1);
    setQuestion(s.question);
    if (s.question) {
      const matches = applyFilters(entries, s.filters);
      setAnswer({
        yes: matches.length > 0,
        count: matches.length,
        total: entries.length,
        top: matches.slice(0, 3),
        intent: intentFromFilters(s.filters),
      });
    } else {
      setAnswer(null);
    }
    setSaved((prev) => prev.map((x) => (x.id === s.id ? markSeen(x, entries) : x)));
  }

  function removeSaved(id: string) {
    setSaved((prev) => prev.filter((x) => x.id !== id));
  }

  const isFiltered =
    filters.query !== "" ||
    filters.region !== "all" ||
    filters.country !== "all" ||
    filters.seniority !== "all" ||
    filters.visa !== "all" ||
    filters.workMode !== "all" ||
    filters.roleType !== "all" ||
    filters.source !== "all";

  const cardLabels: JobCardLabels = {
    remoteWorldwide: t("remoteWorldwide"),
    workModeLabels: { remote: t("remote"), hybrid: t("hybrid"), onsite: t("onsite") },
    hybridDays: (days) => tJob("hybridDays", { days }),
    salaryStated: t("salaryStated"),
    salaryEstimated: t("salaryEstimated"),
    visaYes: t("visaYes"),
    visaNo: t("visaNo"),
    visaUnknown: t("visaUnknown"),
    perYear: t("perYear"),
    perMonth: t("perMonth"),
    posted: (date) => tJob("posted", { date: formatDate(date, locale) }),
    sourceLabels: Object.fromEntries(Object.entries(SOURCE_LABELS)),
  };

  return (
    <div>
      <form onSubmit={ask} className="card-ui mb-4 flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
        <label className="flex-1">
          <span className="sr-only">{t("askLabel")}</span>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("askPlaceholder")}
            className="input-ui"
          />
        </label>
        <button type="submit" className="btn btn-primary">
          {t("askSubmit")}
        </button>
      </form>

      {saved.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{t("savedSearches")}</span>
          {saved.map((s) => {
            const fresh = newCounts[s.id] ?? 0;
            const chips = chipsFor(intentFromFilters(s.filters));
            if (s.filters.roleType !== "all") chips.push(s.filters.roleType.replace("-", " "));
            if (s.filters.source !== "all") {
              chips.push(SOURCE_LABELS[s.filters.source as SourceId] ?? s.filters.source);
            }
            const label = s.question || chips.join(" · ") || t("filters");
            return (
              <span key={s.id} className="chip">
                <button
                  type="button"
                  onClick={() => applySaved(s)}
                  className="font-semibold hover:underline"
                >
                  {label}
                  {fresh > 0 ? ` · ${t("savedNew", { count: fresh })}` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => removeSaved(s.id)}
                  aria-label={t("removeSaved")}
                  className="text-muted hover:text-ink"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {answer && (
        <div className="card-ui mb-6 p-4" role="status">
          <p className="font-serif text-lg font-bold">
            {answer.yes ? t("askYes", { count: answer.count }) : t("askNo")}
          </p>
          {!answer.yes && answer.suggestion && (
            <p className="mt-2 text-sm text-muted">
              {t("askSuggestion", {
                filter: filterLabel(answer.suggestion.dropped),
                count: answer.suggestion.count,
              })}{" "}
              <button
                type="button"
                onClick={applySuggestion}
                className="font-semibold text-brand-500 hover:underline"
              >
                {t("askApply")}
              </button>
            </p>
          )}
          {answerChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t("askUnderstood")}</span>
              {answerChips.map((chip) => (
                <span key={chip} className="chip">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card-ui mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2 lg:col-span-1">
          <span className="sr-only">{t("searchPlaceholder")}</span>
          <input
            type="search"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder={t("searchPlaceholder")}
            className="input-ui"
          />
        </label>

        <label>
          <span className="sr-only">{t("region")}</span>
          <select
            value={filters.region}
            onChange={(e) => update({ region: e.target.value as JobFilters["region"], country: "all" })}
            className="input-ui"
          >
            <option value="all">{t("allRegions")}</option>
            {REGIONS.map((region) => (
              <option key={region.id} value={region.id}>
                {region.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">{t("country")}</span>
          <select
            value={filters.country}
            onChange={(e) => update({ country: e.target.value })}
            className="input-ui"
          >
            <option value="all">{t("allCountries")}</option>
            {countryOptions.map((country) => (
              <option key={country.iso2} value={country.iso2}>
                {country.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">{t("visa")}</span>
          <select value={filters.visa} onChange={(e) => update({ visa: e.target.value as JobFilters["visa"] })} className="input-ui">
            <option value="all">{`${t("visa")}: ${t("visaAny")}`}</option>
            <option value="yes">{t("visaYes")}</option>
            <option value="no">{t("visaNo")}</option>
            <option value="unknown">{t("visaUnknown")}</option>
          </select>
        </label>

        <label>
          <span className="sr-only">{t("workMode")}</span>
          <select
            value={filters.workMode}
            onChange={(e) => update({ workMode: e.target.value as JobFilters["workMode"] })}
            className="input-ui"
          >
            <option value="all">{`${t("workMode")}: ${t("modeAny")}`}</option>
            <option value="remote">{t("remote")}</option>
            <option value="hybrid">{t("hybrid")}</option>
            <option value="onsite">{t("onsite")}</option>
          </select>
        </label>

        <label>
          <span className="sr-only">{t("seniority")}</span>
          <select
            value={filters.seniority}
            onChange={(e) => update({ seniority: e.target.value })}
            className="input-ui"
          >
            <option value="all">{t("allSeniority")}</option>
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>
                {tRoles(s)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">{t("roleType")}</span>
          <select value={filters.roleType} onChange={(e) => update({ roleType: e.target.value })} className="input-ui">
            <option value="all">{`${t("roleType")}: ${t("typeAny")}`}</option>
            {ROLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace("-", " ")}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">{t("source")}</span>
          <select value={filters.source} onChange={(e) => update({ source: e.target.value })} className="input-ui">
            <option value="all">{t("anySource")}</option>
            {Object.entries(SOURCE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="sr-only">{t("sortBy")}</span>
          <select value={filters.sort} onChange={(e) => update({ sort: e.target.value as JobFilters["sort"] })} className="input-ui">
            <option value="newest">{t("sortNewest")}</option>
            <option value="salary">{t("sortSalary")}</option>
          </select>
        </label>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted">
          {t("count", { count: filtered.length })}
        </p>
        {isFiltered && (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveCurrent}
              className="btn-ghost !py-1 text-xs"
            >
              {t("saveSearch")}
            </button>
            <button
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setAnswer(null);
                setQuestion("");
              }}
              className="btn-ghost !py-1 text-xs"
            >
              {t("clear")}
            </button>
          </span>
        )}
      </div>

      {slice.length === 0 ? (
        <div className="card-ui p-10 text-center">
          <p className="font-serif text-lg font-bold">{t("noResults")}</p>
          <p className="mt-2 text-sm text-muted">{t("noResultsBody")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {slice.map((job) => (
            <JobCard key={job.id} job={job} labels={cardLabels} locale={locale} headingLevel="h2" />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-4" aria-label={t("pagination")}>
          <button
            type="button"
            className="btn-ghost"
            disabled={page <= 1}
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              document.getElementById("content")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {t("prev")}
          </button>
          <span className="text-sm text-muted">{t("page", { page, total: pageCount })}</span>
          <button
            type="button"
            className="btn-ghost"
            disabled={page >= pageCount}
            onClick={() => {
              setPage((p) => Math.min(pageCount, p + 1));
              document.getElementById("content")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {t("next")}
          </button>
        </nav>
      )}
    </div>
  );
}
