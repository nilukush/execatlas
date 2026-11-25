import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getStats } from "@/lib/data";
import { buildAlternates } from "@/lib/seo";
import { SOURCE_IDS, SOURCE_LABELS } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    title: t("statsTitle"),
    alternates: buildAlternates(locale, "/stats"),
  };
}

export default async function StatsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Stats");
  const stats = getStats();
  const score = stats.bySourceQuality ?? {};

  return (
    <article className="container-page py-10">
      <h1 className="font-serif text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("intro", { date: new Date(stats.generatedAt).toISOString().slice(0, 10) })}
      </p>
      {stats.carried && stats.carried.total > 0 && (
        <p className="mt-2 text-sm text-muted">{t("carriedNote", { count: stats.carried.total })}</p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="card-ui p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{t("roles")}</p>
          <p className="mt-1 font-serif text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="card-ui p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{t("countries")}</p>
          <p className="mt-1 font-serif text-3xl font-bold">{stats.countries}</p>
        </div>
        <div className="card-ui p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{t("sources")}</p>
          <p className="mt-1 font-serif text-3xl font-bold">{SOURCE_IDS.length}</p>
        </div>
      </div>

      <h2 className="mt-10 font-serif text-xl font-bold">{t("scorecardTitle")}</h2>
      <p className="mt-2 text-sm text-muted">{t("scorecardIntro")}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2 text-start font-semibold">{t("source")}</th>
              <th className="py-2 text-end font-semibold">{t("liveRoles")}</th>
              <th className="py-2 text-end font-semibold">{t("exclusive")}</th>
              <th className="py-2 text-end font-semibold">{t("visaKnown")}</th>
              <th className="py-2 text-end font-semibold">{t("salaryStated")}</th>
              <th className="py-2 text-end font-semibold">{t("medianAge")}</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_IDS.map((id) => {
              const q = score[id];
              return (
                <tr key={id} className="border-b border-line">
                  <td className="py-2">{SOURCE_LABELS[id]}</td>
                  <td className="py-2 text-end tabular-nums">{q?.kept ?? 0}</td>
                  <td className="py-2 text-end tabular-nums">
                    {q ? Math.round((q.exclusive / Math.max(q.kept, 1)) * 100) : 0}%
                  </td>
                  <td className="py-2 text-end tabular-nums">
                    {q ? Math.round((q.visaKnown / Math.max(q.kept, 1)) * 100) : 0}%
                  </td>
                  <td className="py-2 text-end tabular-nums">
                    {q ? Math.round((q.salaryStated / Math.max(q.kept, 1)) * 100) : 0}%
                  </td>
                  <td className="py-2 text-end tabular-nums">
                    {t("days", { count: q?.medianPostedAgeDays ?? 0 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted">{t("methodNote")}</p>
    </article>
  );
}
