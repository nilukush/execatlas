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
  return {
    canonical: `${SITE_URL}/${locale}${clean}`,
    languages: Object.fromEntries(
      Object.entries(LOCALE_HREFLANG).map(([code]) => [code, `${SITE_URL}/${code}${clean}`])
    ),
  };
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
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
