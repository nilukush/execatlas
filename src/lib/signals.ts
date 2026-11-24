import type { IndexEntry, Job } from "./types";

/** The stored fields of a signal, all a card entry carries next to no text. */
type SignalFacts = Pick<Job, "visaBasis" | "visaEvidence">;

export interface SignalView {
  /** Undefined when nothing supports the signal. */
  basis: "posting" | "source" | undefined;
  /** The sentence behind a posting signal. Null when the signal stands on a source tag. */
  evidence: string | null;
}

export function signalView(job: SignalFacts): SignalView {
  if (job.visaBasis === "posting") return { basis: "posting", evidence: job.visaEvidence ?? null };
  if (job.visaBasis === "source") return { basis: "source", evidence: null };
  // A dataset that predates the stored basis gives no basis here. Such a record is read again on
  // the job page, which holds the text, and never in a card or in the client bundle.
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
