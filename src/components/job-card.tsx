import { Link } from "@/i18n/navigation";
import { ADZUNA_HOME } from "@/lib/apply";
import { SOURCE_LABELS, type IndexEntry } from "@/lib/types";
import { remoteScope, signalView } from "@/lib/signals";
import { CompanyLogo } from "./company-logo";
import { formatSalaryBand } from "@/lib/salary";

// the Adzuna terms want a link of at least 116 by 23 pixels, and only a flex box honours a minimum size on an inline element
const MARK_CLASSES =
  "inline-flex min-w-29 min-h-6 items-center justify-center underline underline-offset-2 hover:text-brand-500";

/** The attribution mark the Adzuna terms require on every Adzuna advert. */
export function AdzunaMark({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ? `${MARK_CLASSES} ${className}` : MARK_CLASSES}
    >
      {SOURCE_LABELS.adzuna}
    </a>
  );
}

export interface JobCardLabels {
  remoteWorldwide: string;
  workModeLabels: { remote: string; hybrid: string; onsite: string };
  hybridDays: (days: number) => string;
  salaryStated: string;
  salaryEstimated: string;
  visaYes: string;
  visaYesBySource: (source: string) => string;
  visaNo: string;
  visaUnknown: string;
  perYear: string;
  perMonth: string;
  experience: (min: number, max?: number) => string;
  plusPlaces: (n: number) => string;
  locationRestricted: string;
  worldwideRemote: string;
  relocationYes: string;
  posted: (date: string) => string;
  roleTypeLabels: Record<string, string>;
  sourceLabels: Record<string, string>;
}

export function JobCard({
  job,
  labels,
  locale = "en",
  headingLevel = "h3",
}: {
  job: IndexEntry;
  labels: JobCardLabels;
  locale?: string;
  headingLevel?: "h2" | "h3";
}) {
  const scope = remoteScope(job);
  // a restricted remote role must not claim worldwide in its place line either
  const place = job.countryName ?? (scope === "worldwide" ? labels.remoteWorldwide : (job.region ?? ""));
  const source = labels.sourceLabels[job.source] ?? job.source;
  const visaChip =
    job.visa === "unknown"
      ? null
      : job.visa === "no"
        ? labels.visaNo
        : signalView(job).basis === "source"
          ? labels.visaYesBySource(source)
          : labels.visaYes;
  const Heading = headingLevel;

  return (
    <article className="card-ui relative flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <CompanyLogo name={job.company} logoUrl={job.companyLogoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <Heading className="line-clamp-2 font-serif text-lg font-bold leading-snug">
            <Link href={`/jobs/${job.id}`} className="text-ink hover:text-brand-solid-hover">
              {job.title}
            </Link>
          </Heading>
          <p className="mt-0.5 truncate text-sm text-muted">
            {job.company}
            {place ? ` · ${place}` : ""}
            {job.variantCountries && job.variantCountries.length > 0
              ? ` · ${labels.plusPlaces(job.variantCountries.length)}`
              : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visaChip !== null && (
          <span
            className={`chip ${
              job.visa === "yes"
                ? "!border-transparent !bg-visa-bg !text-visa-fg"
                : "!border-transparent !bg-novisa-bg !text-novisa-fg"
            }`}
          >
            {visaChip}
          </span>
        )}
        {job.relocation === "yes" && <span className="chip">{labels.relocationYes}</span>}
        {scope === "restricted" && <span className="chip">{labels.locationRestricted}</span>}
        {scope === "worldwide" && <span className="chip">{labels.worldwideRemote}</span>}
        {job.workMode !== "unspecified" && (
          <span
            className={`chip ${job.workMode === "hybrid" ? "!border-transparent !bg-hybrid-bg !text-hybrid-fg" : ""}`}
          >
            {job.workMode === "hybrid" && job.officeDays
              ? labels.hybridDays(job.officeDays)
              : (labels.workModeLabels[job.workMode as keyof JobCardLabels["workModeLabels"]] ?? job.workMode)}
          </span>
        )}
        {job.roleType && (
          <span className="chip capitalize">
            {labels.roleTypeLabels[job.roleType] ?? job.roleType.replace("-", " ")}
          </span>
        )}
        {job.experienceMin !== undefined && (
          <span className="chip">{labels.experience(job.experienceMin, job.experienceMax)}</span>
        )}
        {job.salaryMin !== undefined && job.salaryMax !== undefined && job.salaryCurrency && (
          <span className="chip !text-ink">
            {formatSalaryBand(
              {
                min: job.salaryMin,
                max: job.salaryMax,
                currency: job.salaryCurrency,
                period: job.salaryPeriod ?? "annual",
                source: job.salarySource ?? "estimated",
              },
              locale
            )}{" "}
            {job.salaryPeriod === "monthly" ? labels.perMonth : labels.perYear}
            {job.salarySource !== "stated" && <span aria-hidden="true"> *</span>}
            {job.salarySource !== "stated" && (
              <span className="sr-only"> {labels.salaryEstimated}</span>
            )}
          </span>
        )}
        {job.source === "adzuna" ? (
          <AdzunaMark href={job.sourceHome ?? ADZUNA_HOME} className="chip" />
        ) : (
          <span className="chip">{source}</span>
        )}
      </div>

      <p className="mt-auto text-xs text-muted">{labels.posted(job.postedAt)}</p>
    </article>
  );
}
