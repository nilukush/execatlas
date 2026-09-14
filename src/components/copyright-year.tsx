"use client";
import { useState } from "react";

/**
 * Current year rendered client-side: a quiet ingest night can leave the
 * static build untouched across a New Year, so a build-time year can go
 * stale until the next data change.
 */
export function CopyrightYear() {
  const [year] = useState(() => new Date().getFullYear());
  return <span suppressHydrationWarning>{year}</span>;
}
