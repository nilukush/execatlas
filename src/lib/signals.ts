import { visaEvidence } from "./enrich/visa";
import type { IndexEntry, Job } from "./types";

/** A card entry carries no text, so an old record can there be read as a tag only. */
type SignalFacts = Pick<Job, "visa" | "visaBasis" | "visaEvidence" | "source"> & { text?: string };

export interface SignalView {
  /** Undefined when nothing supports the signal. */
  basis: "posting" | "source" | undefined;
  /** The sentence behind a posting signal. Null when the signal stands on a source tag. */
  evidence: string | null;
}

export function signalView(job: SignalFacts): SignalView {
  if (job.visaBasis === "posting") return { basis: "posting", evidence: job.visaEvidence ?? null };
  if (job.visaBasis === "source") return { basis: "source", evidence: null };
  // A dataset that predates the stored basis is read again. The posting wins, as at ingest.
  // Arbeitnow is the one source that tags, and a tag only ever says yes.
  const evidence = job.text ? visaEvidence(job.text) : null;
  if (evidence) return { basis: "posting", evidence };
  if (job.source === "arbeitnow" && job.visa === "yes") return { basis: "source", evidence: null };
  return { basis: undefined, evidence: null };
}

export function remoteScope(
  entry: Pick<IndexEntry, "remote" | "countryIso2" | "region" | "locationRestrictions">
): "worldwide" | "restricted" | null {
  if (!entry.remote) return null;
  // Only an absent list leaves a role unrestricted. Ingest drops an empty list, so a list that
  // is present names countries.
  const open = !entry.countryIso2 && !entry.region && entry.locationRestrictions === undefined;
  return open ? "worldwide" : "restricted";
}
