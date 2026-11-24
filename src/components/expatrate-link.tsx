import type { ReactNode } from "react";
import { EXPATRATE_URL } from "@/lib/salary";

// every catalog mention of ExpatRate sits in a link tag, and a tag renders only through a t.rich handler
export function expatrateLink(chunks: ReactNode) {
  return (
    <a
      href={EXPATRATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-brand-500"
    >
      {chunks}
    </a>
  );
}
