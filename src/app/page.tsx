import { routing } from "@/i18n/routing";

// With output: export, middleware redirects are unavailable, so the bare "/"
// path redirects to the default locale. redirect() renders only an RSC
// payload (a blank page without JavaScript), so this page emits a real meta
// refresh plus a link fallback that work for every visitor and crawler.
export default function RootPage() {
  const target = `/${routing.defaultLocale}`;
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${target}`} />
      <a href={target}>ExecAtlas</a>
    </>
  );
}
