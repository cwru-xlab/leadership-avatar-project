import localFont from "next/font/local";

// Newsreader carries what students read as a moment (titles, figures, statements),
// Public Sans everything they operate, IBM Plex Mono timestamps only.
//
// Self-hosted (latin subset, from Google Fonts, SIL OFL 1.1) so builds never
// fetch fonts over the network: Turbopack's next/font/google fetch failed a
// Vercel build intermittently ("queries have exactly one entry"). Newsreader
// and Public Sans are variable files covering the weights below.
export const fontDisplay = localFont({
  src: [
    { path: "../styles/fonts/newsreader-latin.woff2", weight: "400 500", style: "normal" },
    { path: "../styles/fonts/newsreader-italic-latin.woff2", weight: "400 500", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const fontSans = localFont({
  src: [{ path: "../styles/fonts/public-sans-latin.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
});

export const fontMono = localFont({
  src: [
    { path: "../styles/fonts/ibm-plex-mono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../styles/fonts/ibm-plex-mono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});
