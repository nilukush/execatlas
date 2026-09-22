import { Link } from "@/i18n/navigation";
import type { IndexEntry } from "@/lib/types";
import { CompanyLogo } from "./company-logo";
import { formatSalaryBand } from "@/lib/salary";

export interface JobCardLabels {
  remoteWorldwide: string;
  workModeLabels: { remote: string; hybrid: string; onsite: string };
  hybridDays: (days: number) => string;
  salaryStated: string;
  salaryEstimated: string;
  visaYes: string;
  visaNo: string;
  visaUnknown: string;
  perYear: string;
  perMonth: string;
  experience: (min: number, max?: number) => string;
  plusPlaces: (n: number) => string;
  locationRestricted: string;
  worldwideRemote: string;
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
  const place = job.countryName ?? (job.remote ? labels.remoteWorldwide : (job.region ?? ""));
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
        {job.visa !== "unknown" && (
          <span
            className={`chip ${
              job.visa === "yes"
                ? "!border-transparent !bg-visa-bg !text-visa-fg"
                : "!border-transparent !bg-novisa-bg !text-novisa-fg"
            }`}
          >
            {job.visa === "yes" ? labels.visaYes : labels.visaNo}
          </span>
        )}
        {job.remote && job.countryIso2 && (
          <span className="chip">{labels.locationRestricted}</span>
        )}
        {job.remote && !job.countryIso2 && (
          <span className="chip">{labels.worldwideRemote}</span>
        )}
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
        <span className="chip">{labels.sourceLabels[job.source] ?? job.source}</span>
      </div>

      <p className="mt-auto text-xs text-muted">{labels.posted(job.postedAt)}</p>
    </article>
  );
}
