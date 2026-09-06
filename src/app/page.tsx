import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

// With output: export, middleware redirects are unavailable, so the bare "/"
// path redirects to the default locale. Static export renders this as an
// index.html with a meta refresh.
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
