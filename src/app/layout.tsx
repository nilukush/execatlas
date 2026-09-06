import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const meridian = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-meridian",
  display: "swap",
});

const themeInitScript = `(function(){try{var t=localStorage.getItem("ea-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var el=document.documentElement;if(d){el.classList.add("dark")}}catch(e){}})()`;

const swRegisterScript =
  'if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(){})})}';

/**
 * Root shell. Locale-specific attributes (lang, dir) are applied by an
 * inline script in the [locale] layout before first paint; suppress the
 * hydration warning for the drift that script and browser extensions cause.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${inter.variable} ${meridian.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
      <script dangerouslySetInnerHTML={{ __html: swRegisterScript }} />
    </html>
  );
}
