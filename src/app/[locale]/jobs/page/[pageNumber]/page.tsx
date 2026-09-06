import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getIndexEntries } from "@/lib/data";
import { defaultOrder, paginate } from "@/lib/search";
import { buildAlternates, formatDate } from "@/lib/seo";
import { JobCard, type JobCardLabels } from "@/components/job-card";
import { SOURCE_LABELS } from "@/lib/types";

/** Static, crawlable continuation of the jobs list. Page 1 lives at /jobs. */
export function generateStaticParams() {
  const { jobs: entries } = getIndexEntries();
  const { pageCount } = paginate(defaultOrder(entries), 1);
  const params: Array<{ pageNumber: string }> = [];
  for (let p = 2; p <= pageCount; p++) params.push({ pageNumber: String(p) });
  return params;
}

function parsePage(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || String(n) !== raw || n < 2) return null;
  return n;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; pageNumber: string }>;
}): Promise<Metadata> {
  const { locale, pageNumber } = await params;
  const page = parsePage(pageNumber);
  if (page === null) return {};
  const tMeta = await getTranslations({ locale, namespace: "Meta" });
  const tJobs = await getTranslations({ locale, namespace: "Jobs" });
  return {
    title: `${tMeta("jobsTitle")} · ${tJobs("pageShort", { page })}`,
    description: tMeta("jobsDescription"),
    alternates: buildAlternates(locale, `/jobs/page/${page}`),
  };
}

export default async function JobsListPage({
  params,
}: {
  params: Promise<{ locale: string; pageNumber: string }>;
}) {
  const { locale, pageNumber } = await params;
  setRequestLocale(locale);
  const page = parsePage(pageNumber);
  if (page === null) notFound();

  const t = await getTranslations("Jobs");
  const tJob = await getTranslations("Job");

  const { jobs: entries } = getIndexEntries();
  const ordered = defaultOrder(entries);
  const { slice, pageCount } = paginate(ordered, page);
  if (slice.length === 0) notFound();

  const labels: JobCardLabels = {
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

  const pageHref = (n: number) => (n <= 1 ? "/jobs" : `/jobs/page/${n}`);

  return (
    <section className="container-page py-10">
      <h1 className="font-serif text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("count", { count: entries.length })} · {t("page", { page, total: pageCount })}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {slice.map((job) => (
          <JobCard key={job.id} job={job} labels={labels} locale={locale} headingLevel="h2" />
        ))}
      </div>

      <nav className="mt-8 flex flex-wrap items-center justify-center gap-4" aria-label={t("pagination")}>
        <Link href={pageHref(page - 1)} className="btn-ghost">
          {t("prev")}
        </Link>
        <span className="text-sm text-muted">{t("page", { page, total: pageCount })}</span>
        {page < pageCount && (
          <Link href={pageHref(page + 1)} className="btn-ghost">
            {t("next")}
          </Link>
        )}
      </nav>

      <p className="mt-6 text-center">
        <Link href="/jobs" className="text-sm font-semibold text-brand-500 hover:underline">
          {t("backToBrowser")}
        </Link>
      </p>
    </section>
  );
}
