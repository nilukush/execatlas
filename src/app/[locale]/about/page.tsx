import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { getQueryCount } from "@/lib/data";
import { buildAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    title: t("aboutTitle"),
    description: t("aboutDescription"),
    alternates: buildAlternates(locale, "/about"),
  };
}

const SOURCES_STATUS = [
  { name: "Greenhouse", status: "official-api", url: "https://docs.greenhouse.io/job-board.html" },
  { name: "Workable", status: "public-endpoint", url: "https://jobs.workable.com" },
  { name: "Arbeitnow", status: "open-api", url: "https://www.arbeitnow.com/blog/job-board-api" },
  { name: "Jobicy", status: "open-api", url: "https://jobicy.com/jobs-api" },
  { name: "LinkedIn", status: "no-compliant-path", url: "https://www.linkedin.com" },
  { name: "Indeed", status: "no-compliant-path", url: "https://www.indeed.com" },
  { name: "Naukri.com", status: "no-compliant-path", url: "https://www.naukri.com" },
  { name: "Naukrigulf", status: "no-compliant-path", url: "https://www.naukrigulf.com" },
  { name: "GulfTalent", status: "no-compliant-path", url: "https://www.gulftalent.com" },
];

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("About");
  const queryCount = getQueryCount();

  return (
    <section className="container-page max-w-3xl py-12">
      <h1 className="font-serif text-3xl font-bold">{t("title")}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">{t("intro")}</p>

      <h2 className="mt-10 font-serif text-2xl font-bold">{t("sourcesTitle")}</h2>
      <p className="mt-3 leading-relaxed">{t("sourcesBody")}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-start">
              <th className="py-2 text-start font-semibold">Source</th>
              <th className="py-2 text-start font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES_STATUS.map((source) => (
              <tr key={source.name} className="border-b border-line">
                <td className="py-2">
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {source.name}
                  </a>
                </td>
                <td className="py-2 text-muted">
                  {source.status === "no-compliant-path" ? "not used (no compliant access)" : "active"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-serif text-2xl font-bold">{t("blockedTitle")}</h2>
      <p className="mt-3 leading-relaxed">{t("blockedBody")}</p>

      <h2 className="mt-10 font-serif text-2xl font-bold">{t("visaTitle")}</h2>
      <p className="mt-3 leading-relaxed">{t("visaBody")}</p>
      <p className="mt-2 text-sm text-muted">{queryCount} role query variations are searched on every refresh.</p>

      <h2 className="mt-10 font-serif text-2xl font-bold">{t("salaryTitle")}</h2>
      <p className="mt-3 leading-relaxed">{t("salaryBody")}</p>

      <h2 className="mt-10 font-serif text-2xl font-bold">{t("limitsTitle")}</h2>
      <p className="mt-3 leading-relaxed">{t("limitsBody")}</p>
    </section>
  );
}
