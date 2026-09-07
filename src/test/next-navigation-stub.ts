// Test stub for next/navigation: next-intl's createNavigation (used by the
// locale-aware Link) imports hooks that only exist inside the Next runtime.
export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
});
export const usePathname = () => "/";
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({ locale: "en" });
export const useSelectedLayoutSegments = () => [];
export const redirect = () => {
  throw new Error("redirect() called in a test");
};
export const notFound = () => {
  throw new Error("notFound() called in a test");
};
