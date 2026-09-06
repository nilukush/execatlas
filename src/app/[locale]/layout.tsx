import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SITE_URL, buildAlternates } from "@/lib/seo";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: t("title"),
      template: `%s | ${t("siteName")}`,
    },
    description: t("description"),
    alternates: buildAlternates(locale, "/"),
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("title"),
      description: t("description"),
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e15" },
  ],
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  // Applies locale attributes to <html> before first paint; the root layout
  // renders lang="en" by default and suppresses the hydration drift.
  const localeAttrsScript = `document.documentElement.lang=${JSON.stringify(locale)};document.documentElement.dir=${locale === "ar" ? '"rtl"' : '"ltr"'}`;

  return (
    <NextIntlClientProvider>
      <script dangerouslySetInnerHTML={{ __html: localeAttrsScript }} />
      <a href="#content" className="skip-link">
        {tNav("skipToContent")}
      </a>
      <SiteHeader />
      <main id="content">{children}</main>
      <SiteFooter />
    </NextIntlClientProvider>
  );
}
