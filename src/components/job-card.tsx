import { Link } from "@/i18n/navigation";
import type { IndexEntry } from "@/lib/types";
import { CompanyLogo } from "./company-logo";
import { formatSalaryBand } from "@/lib/salary";

export interface JobCardLabels {
  remoteWorldwide: string;
  hybridDays: (days: number) => string;
  salaryStated: string;
  salaryEstimated: string;
  visaYes: string;
  visaNo: string;
  visaUnknown: string;
  perYear: string;
  perMonth: string;
  posted: (date: string) => string;
  sourceLabels: Record<string, string>;
}

export function JobCard({ job, labels }: { job: IndexEntry; labels: JobCardLabels }) {
  const place = job.countryName ?? (job.remote ? labels.remoteWorldwide : (job.region ?? ""));

  return (
    <article className="card-ui relative flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <CompanyLogo name={job.company} logoUrl={job.companyLogoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg font-bold leading-snug">
            <Link href={`/jobs/${job.id}`} className="text-ink hover:text-brand-solid-hover">
              {job.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {job.company}
            {place ? ` · ${place}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span
          className={`chip ${
            job.visa === "yes"
              ? "!border-transparent !bg-visa-bg !text-visa-fg"
              : job.visa === "no"
                ? "!border-transparent !bg-novisa-bg !text-novisa-fg"
                : ""
          }`}
        >
          {job.visa === "yes" ? labels.visaYes : job.visa === "no" ? labels.visaNo : labels.visaUnknown}
        </span>
        {job.workMode !== "unspecified" && (
          <span
            className={`chip ${job.workMode === "hybrid" ? "!border-transparent !bg-hybrid-bg !text-hybrid-fg" : ""}`}
          >
            {job.workMode === "hybrid" && job.officeDays ? labels.hybridDays(job.officeDays) : job.workMode}
          </span>
        )}
        {job.roleType && <span className="chip capitalize">{job.roleType.replace("-", " ")}</span>}
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
              "en"
            )}{" "}
            {job.salaryPeriod === "monthly" ? labels.perMonth : labels.perYear}
            <span className="font-normal text-muted">
              {" "}
              ({job.salarySource === "stated" ? labels.salaryStated : labels.salaryEstimated})
            </span>
          </span>
        )}
        <span className="chip">{labels.sourceLabels[job.source] ?? job.source}</span>
      </div>

      <p className="mt-auto text-xs text-muted">{labels.posted(job.postedAt)}</p>
    </article>
  );
}
