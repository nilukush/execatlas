import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getIndexEntries } from "@/lib/data";
import { JobsBrowser } from "@/components/jobs-browser";
import { buildAlternates } from "@/lib/seo";
import { defaultOrder, paginate } from "@/lib/search";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    title: t("jobsTitle"),
    description: t("jobsDescription"),
    alternates: buildAlternates(locale, "/jobs"),
  };
}

export default async function JobsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Jobs");
  const { jobs: entries } = getIndexEntries();
  const { pageCount } = paginate(defaultOrder(entries), 1);

  return (
    <section className="container-page py-10">
      <h1 className="font-serif text-3xl font-bold">{t("title")}</h1>
      <div className="mt-6">
        <JobsBrowser entries={entries} locale={locale} />
      </div>
      {pageCount > 1 && (
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-1" aria-label={t("pagination")}>
          <span aria-current="page" className="px-2 py-1 text-sm font-semibold text-brand-500">
            1
          </span>
          {Array.from({ length: pageCount - 1 }, (_, i) => i + 2).map((n) => (
            <Link
              key={n}
              href={`/jobs/page/${n}`}
              className="px-2 py-1 text-sm text-muted hover:text-brand-500"
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </section>
  );
}
