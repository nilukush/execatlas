import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getIndexEntries, getStats } from "@/lib/data";
import { JobCard, type JobCardLabels } from "@/components/job-card";
import { SOURCE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/seo";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const tJobs = await getTranslations("Jobs");
  const tJob = await getTranslations("Job");

  const { jobs: entries } = getIndexEntries();
  const stats = getStats();
  const latest = entries.slice(0, 6);

  const labels: JobCardLabels = {
    remoteWorldwide: tJobs("remoteWorldwide"),
    hybridDays: (days) => tJob("hybridDays", { days }),
    salaryStated: tJobs("salaryStated"),
    salaryEstimated: tJobs("salaryEstimated"),
    visaYes: tJobs("visaYes"),
    visaNo: tJobs("visaNo"),
    visaUnknown: tJobs("visaUnknown"),
    perYear: tJobs("perYear"),
    perMonth: tJobs("perMonth"),
    posted: (date) => tJob("posted", { date: formatDate(date, locale) }),
    sourceLabels: Object.fromEntries(Object.entries(SOURCE_LABELS)),
  };

  return (
    <>
      <section className="border-b border-line bg-card-2/50">
        <div className="container-page py-14 sm:py-20">
          <p className="chip">{t("kicker")}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">{t("heroSubtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/jobs" className="btn-primary">
              {t("browse")}
            </Link>
            <Link href="/about" className="btn-ghost">
              {t("howItWorks")}
            </Link>
          </div>

          {stats && stats.total > 0 && (
            <dl className="mt-10 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="card-ui p-4">
                <dt className="text-xs text-muted">{t("statRoles")}</dt>
                <dd className="mt-1 font-serif text-2xl font-bold">{stats.total}</dd>
              </div>
              <div className="card-ui p-4">
                <dt className="text-xs text-muted">{t("statCountries")}</dt>
                <dd className="mt-1 font-serif text-2xl font-bold">{stats.countries}</dd>
              </div>
              <div className="card-ui p-4">
                <dt className="text-xs text-muted">{t("statSources")}</dt>
                <dd className="mt-1 font-serif text-2xl font-bold">
                  {Object.keys(stats.bySource).length}
                </dd>
              </div>
              <div className="card-ui p-4">
                <dt className="text-xs text-muted">{t("updated")}</dt>
                <dd className="mt-1 font-serif text-2xl font-bold">
                  {formatDate(stats.generatedAt, locale)}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </section>

      <section className="container-page py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="card-ui p-6">
            <h2 className="font-serif text-lg font-bold">{t("featureVisaTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("featureVisaBody")}</p>
          </div>
          <div className="card-ui p-6">
            <h2 className="font-serif text-lg font-bold">{t("featurePayTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("featurePayBody")}</p>
          </div>
          <div className="card-ui p-6">
            <h2 className="font-serif text-lg font-bold">{t("featureApplyTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("featureApplyBody")}</p>
          </div>
        </div>
      </section>

      {latest.length > 0 && (
        <section className="container-page pb-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="font-serif text-2xl font-bold">{t("latest")}</h2>
            <Link href="/jobs" className="text-sm font-semibold text-brand-solid hover:underline">
              {t("viewAll")} →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {latest.map((job) => (
              <JobCard key={job.id} job={job} labels={labels} />
            ))}
          </div>
          <p className="mt-6 text-xs text-muted">{t("sourcesNote")}</p>
        </section>
      )}
    </>
  );
}
