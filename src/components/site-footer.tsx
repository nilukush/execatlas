import { getTranslations } from "next-intl/server";
import { EXPATRATE_URL } from "@/lib/salary";
import { Link } from "@/i18n/navigation";
import { CopyrightYear } from "./copyright-year";

export async function SiteFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="mt-16 border-t border-line bg-card-2/60">
      <div className="container-page grid gap-6 py-10 text-sm text-muted sm:grid-cols-3">
        <div>
          <p className="font-serif text-base font-bold text-ink">ExecAtlas</p>
          <p className="mt-2 max-w-xs">{t("tagline")}</p>
        </div>
        <div className="space-y-2">
          <p>{t("data")}</p>
          <p>
            {t.rich("salary", {
              link: (chunks) => (
                <a
                  href={EXPATRATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-brand-500"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
        <div className="space-y-2 sm:text-end">
          <Link href="/about" className="block font-medium text-ink hover:underline">
            {t("method")}
          </Link>
          <p>
            © <CopyrightYear /> ExecAtlas. {t("license")}
          </p>
        </div>
      </div>
    </footer>
  );
}
