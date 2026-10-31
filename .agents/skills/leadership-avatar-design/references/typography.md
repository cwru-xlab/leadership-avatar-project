# Typography

Three faces with separate jobs: a serif for what students read as a moment, a sans for everything
they operate, a mono for time.

| Face | Job | Why |
|---|---|---|
| Newsreader (Google Fonts) | Page title, section headings, score and stat figures, statements (italic) | Gives the app an academic, Weatherhead voice; optical sizes stay crisp from 16 to 40px |
| Public Sans | Everything students read and operate: body, labels, tabs, buttons, chips, forms | Institutional, sturdy, readable at kiosk distance; good tabular figures |
| IBM Plex Mono | Timestamps and time ranges only (`02:14`, `4:05–4:22`) | Makes time scannable and distinct from prose |

## Scale

| Token | Face | Size / line height | Weight | Example |
|---|---|---|---|---|
| `title` | Newsreader | 32 / 1.1, tracking -0.01em | 500 | Your interview report |
| `figure` | Newsreader | 36–40 / 1.0, lining figures | 500 | 4 / 5, 138 wpm |
| `section` | Newsreader | 22–26 / 1.15 | 500 | Strengths, Moments, Keep doing |
| `statement` | Newsreader italic | 24 / 1.35 (practice-next), 16–18 (quotes) | 400 | "End each story with the result as a number." |
| `body` | Public Sans | 15–17 / 1.55 | 400 | You named the stakes early. |
| `label` | Public Sans, sentence case | 13 / 1.3 | 600 | Speech rate, One thing to practice next time |
| `small` | Public Sans | 12.5–13 / 1.45 | 400 | Inside the interview target of 100–159 wpm |
| `time` | IBM Plex Mono | 12.5–13 / 1.5 | 400 | 4:05–4:22 |

A unit beside a figure is Public Sans 14–15px in muted ink: "4" then "/ 5", "138" then "wpm".

Tailwind classes (once tokens are in place, see `tokens.md`):
`font-display text-[32px] leading-[1.1] font-medium text-cwru-blue` for the title;
`font-display text-[40px] leading-none font-medium text-cwru-blue [font-variant-numeric:lining-nums]`
for a figure; `text-[13px] font-semibold text-muted` for a label;
`font-mono text-[13px] text-muted tabular-nums` for a time.

## Rules

- Newsreader only in its four roles. Never on buttons, tabs, labels, chips, table cells or form
  fields, where a serif slows scanning.
- Italic is for whole statements (the practice-next line, evidence quotes, "What you said"). Never
  one accent word inside a heading: that reads as a generated-page tell.
- Sentence case everywhere, labels included. No tracked uppercase, no mono labels, no index numbers
  ("01", "03") used as decoration. A count beside a heading is plain small text: "Strengths 3".
- No label above a page title (no eyebrow). Put the practice type in the line under the title.
- Running text max 65ch. Statements max about 48ch.
- `tabular-nums` in tables, stat figures and timers so digits line up.
- Weights: 400 body, 500 for serif display, 600 labels and emphasis, 700 only for initials avatars.
- `text-wrap: balance` on headings.
- Kiosk mode multiplies every size by 1.25 instead of adding new sizes.

## Next.js setup

The app currently loads Inter and Fira Code in `config/fonts.ts`. Replace them:

```ts
// config/fonts.ts
import { IBM_Plex_Mono, Newsreader, Public_Sans } from "next/font/google";

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
```

Add all three `.variable` classes to `<body>` in `app/layout.tsx`, and add
`display: ["var(--font-display)"]` to `theme.extend.fontFamily` in `tailwind.config.mjs`.

## Do and don't

| Do | Don't |
|---|---|
| "Your interview report" in Newsreader 32 | "Your *interview* report" with an italic accent word |
| "Speech rate" as a 13px sentence-case label | "SPEECH RATE" in tracked mono |
| `4:05–4:22` in mono beside a camera moment | Mono for labels, counts or headings |
| Figures at 36–40px | Figures at 48px or more on an app screen |
| Practice-next line as a 24px italic statement | A 40px italic sentence that reads as a headline |
