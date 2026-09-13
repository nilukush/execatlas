export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === "production"
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_DOMAIN ?? "execatlas.vercel.app"}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:4317");

export const LOCALE_HREFLANG: Record<string, string> = {
  en: "en",
  hi: "hi",
  ar: "ar",
  id: "id",
};

/** Canonical and hreflang alternates for a locale-prefixed path like "/jobs". */
export function buildAlternates(locale: string, path: string) {
  const clean = path === "/" ? "" : path;
  const languages: Record<string, string> = {};
  for (const code of Object.keys(LOCALE_HREFLANG)) {
    languages[code] = `${SITE_URL}/${code}${clean}`;
  }
  // x-default covers locales outside the four we ship; it points at the default
  languages["x-default"] = `${SITE_URL}/en${clean}`;
  return {
    canonical: `${SITE_URL}/${locale}${clean}`,
    languages,
  };
}

/** Shareable one-line summary of a role for meta descriptions and previews. */
export function jobOgDescription(title: string, company: string, place: string | null, tail: string): string {
  const where = place ? ` in ${place}` : "";
  return `${title} at ${company}${where}. ${tail}`;
}

export const DATE_LOCALE: Record<string, string> = {
  en: "en-GB",
  hi: "hi-IN",
  ar: "ar",
  id: "id-ID",
};

export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // timeZone pinned so the static build (UTC) and every visitor's browser
  // render the same day; unpinned Intl formatting shifts dates across
  // timezones and breaks hydration on the jobs list.
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
