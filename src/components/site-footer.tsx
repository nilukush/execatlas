import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations("Footer");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-line bg-card-2/60">
      <div className="container-page grid gap-6 py-10 text-sm text-muted sm:grid-cols-3">
        <div>
          <p className="font-serif text-base font-bold text-ink">ExecAtlas</p>
          <p className="mt-2 max-w-xs">{t("tagline")}</p>
        </div>
        <div className="space-y-2">
          <p>{t("data")}</p>
          <p>{t("salary")}</p>
        </div>
        <div className="space-y-2 sm:text-end">
          <Link href="/about" className="block font-medium text-ink hover:underline">
            {t("method")}
          </Link>
          <p>
            © {year} ExecAtlas. {t("license")}
          </p>
        </div>
      </div>
    </footer>
  );
}
