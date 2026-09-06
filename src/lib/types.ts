import type { RegionId } from "./locations";
import type { Seniority, Domain } from "./roles";

export type SourceId = "greenhouse" | "workable" | "arbeitnow" | "jobicy";

export const SOURCE_IDS: SourceId[] = ["greenhouse", "workable", "arbeitnow", "jobicy"];

export const SOURCE_LABELS: Record<SourceId, string> = {
  greenhouse: "Greenhouse",
  workable: "Workable",
  arbeitnow: "Arbeitnow",
  jobicy: "Jobicy",
};

export type VisaSignal = "yes" | "no" | "unknown";
export type WorkMode = "remote" | "hybrid" | "onsite" | "unspecified";
export type RoleType =
  | "permanent"
  | "contract"
  | "freelance"
  | "temporary"
  | "part-time"
  | "full-time"
  | "interim";

export interface SalaryBand {
  min: number;
  max: number;
  currency: string;
  period: "annual" | "monthly";
  source: "stated" | "estimated";
  quality?: "High" | "Medium" | "Low";
  familyUsed?: string;
}

export interface JobLocation {
  countryIso2?: string;
  countryName?: string;
  region: RegionId | null;
  remote: boolean;
  raw: string;
}

export type JdBlock =
  | { type: "heading"; text: string }
  | { type: "para"; text: string }
  | { type: "list"; items: string[] };

/** What a source connector produces before normalization and enrichment. */
export interface RawJob {
  source: SourceId;
  externalId: string;
  title: string;
  company: string;
  companyLogoUrl?: string;
  applyUrl: string;
  sourceUrl: string;
  descriptionHtml?: string;
  locationRaw: string;
  remoteHint?: boolean;
  employmentHint?: string | null;
  salaryHint?: { min: number; max: number; currency: string; period: "annual" | "monthly" } | null;
  postedAt?: string | null;
  posterName?: string | null;
  posterUrl?: string | null;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  companyLogoUrl?: string;
  applyUrl: string;
  sourceUrl: string;
  source: SourceId;
  sources: SourceId[];
  text: string;
  blocks: JdBlock[];
  requirements: string[];
  location: JobLocation;
  seniority: Seniority;
  domain: Domain;
  visa: VisaSignal;
  workMode: WorkMode;
  officeDays?: number;
  roleType: RoleType | null;
  salary: SalaryBand | null;
  postedAt: string;
  firstSeen: string;
  updatedAt: string;
  posterName?: string;
  posterUrl?: string;
}

/** Compact card/search index entry derived from a Job. */
export interface IndexEntry {
  id: string;
  title: string;
  company: string;
  companyLogoUrl?: string;
  seniority: Seniority;
  domain: Domain;
  countryIso2?: string;
  countryName?: string;
  region: RegionId | null;
  remote: boolean;
  visa: VisaSignal;
  workMode: WorkMode;
  officeDays?: number;
  roleType: RoleType | null;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: "annual" | "monthly";
  salarySource?: "stated" | "estimated";
  postedAt: string;
  source: SourceId;
}

export interface DatasetStats {
  generatedAt: string;
  total: number;
  bySource: Record<string, number>;
  byRegion: Record<string, number>;
  byVisa: Record<string, number>;
  countries: number;
}
