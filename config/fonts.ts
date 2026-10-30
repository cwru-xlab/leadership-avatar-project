import { IBM_Plex_Mono, Newsreader, Public_Sans } from "next/font/google";

// Newsreader carries what students read as a moment (titles, figures, statements),
// Public Sans everything they operate, IBM Plex Mono timestamps only.
export const fontDisplay = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const fontSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});
