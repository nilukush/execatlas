import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const meta = await getTranslations("Meta");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="container-page flex h-14 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2" aria-label={meta("siteName")}>
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="13" stroke="var(--brand-solid)" strokeWidth="2.5" />
            <path
              d="M16 3c4 4 4 22 0 26M3 16h26M6 7.5c5.5 3.5 14.5 3.5 20 0M6 24.5c5.5-3.5 14.5-3.5 20 0"
              stroke="var(--brand-solid)"
              strokeWidth="1.6"
              opacity="0.7"
            />
            <circle cx="21" cy="11" r="3" fill="var(--amber-700, #92400e)" />
          </svg>
          <span className="font-serif text-lg font-bold tracking-tight">
            Exec<span className="text-brand-500">Atlas</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label={t("menu")}>
          <Link
            href="/jobs"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-card-2 hover:text-ink"
          >
            {t("jobs")}
          </Link>
          <Link
            href="/about"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-card-2 hover:text-ink sm:block"
          >
            {t("about")}
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
