import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ExecAtlas: senior engineering leadership jobs",
    short_name: "ExecAtlas",
    description:
      "Director, VP and CTO roles across India, the Middle East, Southeast Asia, North Africa, Europe and North America.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#2b44c8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
