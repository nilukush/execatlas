import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getIndexEntries } from "@/lib/data";
import { JobsBrowser } from "@/components/jobs-browser";
import { buildAlternates } from "@/lib/seo";

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

  return (
    <section className="container-page py-10">
      <h1 className="font-serif text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("count", { count: entries.length })}</p>
      <div className="mt-6">
        <JobsBrowser entries={entries} locale={locale} />
      </div>
    </section>
  );
}
