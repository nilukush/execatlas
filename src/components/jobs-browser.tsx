"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { IndexEntry } from "@/lib/types";
import { COUNTRIES, REGIONS } from "@/lib/locations";
import { SOURCE_LABELS } from "@/lib/types";
import { applyFilters, DEFAULT_FILTERS, paginate, type JobFilters } from "@/lib/search";
import { answerQuestion, type AskAnswer } from "@/lib/ask";
import { formatDate } from "@/lib/seo";
import { JobCard, type JobCardLabels } from "./job-card";

const SENIORITIES = ["cto", "vp", "avp", "director", "head"] as const;
const ROLE_TYPES = ["permanent", "contract", "freelance", "temporary", "part-time", "full-time", "interim"] as const;

export function JobsBrowser({ entries, locale }: { entries: IndexEntry[]; locale: string }) {
  const t = useTranslations("Jobs");
  const tJob = useTranslations("Job");
  const tRoles = useTranslations("Roles");
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);

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
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    const a = answerQuestion(q, entries);
    setAnswer(a);
    update({
      query: a.intent.query,
      seniority: a.intent.seniority,
      region: a.intent.region,
      country: a.intent.country,
      visa: a.intent.visa,
      workMode: a.intent.workMode,
    });
  }

  const answerChips: string[] = [];
  if (answer) {
    const { intent } = answer;
    if (intent.query) answerChips.push(intent.query);
    if (intent.seniority !== "all") answerChips.push(tRoles(intent.seniority));
    if (intent.country !== "all") {
      answerChips.push(COUNTRIES.find((c) => c.iso2 === intent.country)?.name ?? intent.country);
    } else if (intent.region !== "all") {
      answerChips.push(REGIONS.find((r) => r.id === intent.region)?.label ?? intent.region);
    }
    if (intent.visa === "yes") answerChips.push(t("visaYes"));
    if (intent.workMode !== "all") answerChips.push(t(intent.workMode));
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

      {answer && (
        <div className="card-ui mb-6 p-4" role="status">
          <p className="font-serif text-lg font-bold">
            {answer.yes ? t("askYes", { count: answer.count }) : t("askNo")}
          </p>
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
