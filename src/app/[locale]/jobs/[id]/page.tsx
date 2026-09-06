import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAllJobIds, getJobById } from "@/lib/data";
import { CompanyLogo } from "@/components/company-logo";
import { SOURCE_LABELS, type JdBlock } from "@/lib/types";
import { formatSalaryBand, SALARY_ATTRIBUTION } from "@/lib/salary";
import { countryByIso2, regionLabel } from "@/lib/locations";
import { buildAlternates, formatDate, SITE_URL } from "@/lib/seo";

export function generateStaticParams() {
  return getAllJobIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const job = getJobById(id);
  if (!job) return {};
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    title: t("jobTitle", { title: job.title, company: job.company }),
    description: job.text.slice(0, 155),
    alternates: buildAlternates(locale, `/jobs/${job.id}`),
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const job = getJobById(id);
  if (!job) notFound();

  const t = await getTranslations("Job");
  const tJobs = await getTranslations("Jobs");
  const country = job.location.countryIso2 ? countryByIso2(job.location.countryIso2) : null;
  const place = country?.name ?? (job.location.remote ? tJobs("remoteWorldwide") : (job.location.region ? regionLabel(job.location.region) : job.location.raw));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.text.slice(0, 4000),
    datePosted: job.postedAt,
    employmentType: job.roleType?.toUpperCase().replace("-", "_"),
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
      ...(job.companyLogoUrl ? { logo: job.companyLogoUrl } : {}),
    },
    ...(job.location.remote
      ? { jobLocationType: "TELECOMMUTE" }
      : {}),
    ...(country
      ? {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressCountry: country.iso2, addressRegion: country.name },
          },
        }
      : {}),
    url: `${SITE_URL}/${locale}/jobs/${job.id}`,
    ...(job.salary
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: job.salary.currency,
            value: {
              "@type": "QuantitativeValue",
              minValue: job.salary.min,
              maxValue: job.salary.max,
              unitText: job.salary.period === "monthly" ? "MONTH" : "YEAR",
            },
          },
        }
      : {}),
    directApply: true,
  };

  return (
    <article className="container-page py-10">
      {/*
        JSON-LD inside a script element: escape "<" so a posting containing
        the literal text "</script>" cannot terminate this element early.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <Link href="/jobs" className="text-sm font-semibold text-brand-solid hover:underline">
        ← {t("back")}
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <CompanyLogo name={job.company} logoUrl={job.companyLogoUrl} size={56} />
          <div>
            <h1 className="max-w-2xl font-serif text-3xl font-bold leading-tight">{job.title}</h1>
            <p className="mt-1 text-muted">
              {job.company} · {place} · {t("posted", { date: formatDate(job.postedAt, locale) })}
            </p>
          </div>
        </div>
        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
          {t("apply")}
        </a>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          {job.requirements.length > 0 && (
            <section className="card-ui border-brand-100 p-6">
              <h2 className="font-serif text-xl font-bold">{t("requirements")}</h2>
              <ul className="mt-4 space-y-2">
                {job.requirements.map((line, index) => (
                  <li key={index} className="flex gap-2 text-sm leading-relaxed">
                    <span aria-hidden="true" className="mt-1 text-visa-fg">✓</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="font-serif text-xl font-bold">{t("description")}</h2>
            <div className="mt-4 space-y-3">
              {job.blocks.map((block, index) => (
                <JdBlockView key={index} block={block} />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card-ui p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("salary")}</h2>
            {job.salary ? (
              <>
                <p className="mt-2 font-serif text-lg font-bold">
                  {formatSalaryBand(job.salary, locale)}{" "}
                  <span className="text-sm font-normal text-muted">
                    / {job.salary.period === "monthly" ? tJobs("perMonth") : tJobs("perYear")}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {job.salary.source === "stated" ? t("stated") : t("estimated")}
                  {job.salary.quality ? ` · ${job.salary.quality}` : ""}
                </p>
                {job.salary.source === "estimated" && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">{t("estimateNote")}</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("noSalary")}</p>
            )}
          </section>

          <section className="card-ui p-5 text-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("location")}</h2>
            <p className="mt-2">{place}</p>
            {job.location.region && <p className="text-muted">{regionLabel(job.location.region)}</p>}
            {job.workMode === "hybrid" && job.officeDays && (
              <p className="mt-2 text-muted">{t("hybridDays", { days: job.officeDays })}</p>
            )}
            {country?.expatFriendly && <p className="mt-2 text-visa-fg">✓ {t("expatFriendlyYes")}</p>}
          </section>

          <section className="card-ui p-5 text-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("source")}</h2>
            <p className="mt-2">
              {job.sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ")}
            </p>
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-semibold text-brand-solid hover:underline"
            >
              {t("viewOriginal")}
            </a>
            <p className="mt-3 text-xs leading-relaxed text-muted">{SALARY_ATTRIBUTION}</p>
          </section>
        </aside>
      </div>
    </article>
  );
}

function JdBlockView({ block }: { block: JdBlock }) {
  if (block.type === "heading") {
    return <h3 className="!mt-6 font-serif text-lg font-bold">{block.text}</h3>;
  }
  if (block.type === "list") {
    return (
      <ul className="list-disc space-y-1 ps-5 text-sm leading-relaxed">
        {block.items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm leading-relaxed">{block.text}</p>;
}
