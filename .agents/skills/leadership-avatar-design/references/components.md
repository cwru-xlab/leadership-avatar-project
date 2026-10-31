# UI components

The app uses HeroUI 2 packages (`@heroui/button`, `card`, `chip`, `tabs`, `accordion`, `modal`,
`progress`, `input`, `select`, `tooltip`, `toast`) with Tailwind 4 and `lucide-react` icons. Restyle
HeroUI through tokens rather than replacing it. Class names below assume the tokens in `tokens.md`
(`cwru-blue`, `true-blue`, `ink`, `muted`, `line`, `canvas`, and the status colors).

## Contents
- Buttons
- Status chips
- AI label and live signal
- Selectable cards (pickers)
- Progress: bar, step dots, score cards
- Tabs
- Inputs and errors
- Expandable section
- Extractable section (side panel, copy, download)
- Icons
- Sidebar
- Score panel and stat tiles
- Takeaways columns
- Moments timeline

## Buttons

| Variant | Look | Use |
|---|---|---|
| Primary | CWRU Blue fill, white text | The one main action per view |
| Secondary | White, 1px CWRU Blue border, CWRU Blue text | Other actions beside primary |
| Ghost | No fill, True Blue text | Skip, Cancel, tertiary actions |
| Danger | Copper Red fill, white text | End session, delete |

40px tall (44px on touch), 8px radius, Public Sans 600 at 14px, verb-first labels.

```tsx
import { Button } from "@heroui/button";

<Button className="h-10 rounded-lg bg-cwru-blue px-4 font-semibold text-white">
  Start practice
</Button>
<Button variant="bordered" className="h-10 rounded-lg border-cwru-blue font-semibold text-cwru-blue">
  View report
</Button>
<Button className="h-10 rounded-lg bg-copper font-semibold text-white">End session</Button>
```

Do: "Start practice", "Build study plan", "End session".
Don't: "Practice", "Submit", "OK", or two primary buttons side by side.

## Level chips

A score or mastery level on the shared 1–5 ramp. Tinted pill, colored dot, Dark Blue word. The
label comes from the caller (the report's `SCORE_LABELS` or `levelName()` in
`lib/mastery/levels.ts`), so this component never invents its own names.

```tsx
const LEVEL_COLOR: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: "var(--la-level-5)",
  4: "var(--la-level-4)",
  3: "var(--la-light-blue)",
  2: "var(--la-level-2)",
  1: "var(--la-level-1)",
};

export function LevelChip({ level, label }: { level: 1 | 2 | 3 | 4 | 5; label: string }) {
  const color = LEVEL_COLOR[level];
  const tint = level === 3 ? 32 : 16;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-[12.5px] font-semibold text-ink"
      style={{ background: `color-mix(in srgb, ${color} ${tint}%, white)` }}
    >
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}
```

Always include the word. Never use a solid Orange or Vivid Green chip with white text. "Not yet
measured" gets no chip: muted text, and a hatch background on its card.

## Source and timecode chips (reports)

- **Source chip** says where a finding came from: "From your resume", "From the conversation",
  "Resume + conversation". Light Blue 32% tint, CWRU Blue 12px text, 4px radius. Render nothing when
  the source is absent; never an "unknown" badge.
- **Timecode chip**: `m:ss` in IBM Plex Mono 12px, muted. Shown on the collapsed growth-area row,
  because it links to that point on the Moments timeline and is useless if hidden inside the row.

## AI label and live signal

- **AI label:** any text a model wrote at runtime (coach tips, summaries, plan rationale).
  `text-xs font-semibold text-ai bg-ai/10 px-2 py-0.5 rounded-sm`, sentence case: "AI feedback",
  "AI coach tip". Students should always know when feedback is generated.
- **Live signal:** Force Blue 9px dot with a 4px halo at 18% plus a label ("Avatar speaking",
  "Recording"). Shown only while live. Use `aria-live="polite"` on the label.

## Selectable cards (pickers)

Used on the practice type picker and scenario choice.

- Resting: white, 1px line, 8px radius, 16px padding, Lucide icon, name (Public Sans 600 15px),
  one-line description in muted 13px.
- Hover: border True Blue at 50%.
- Selected: 2px True Blue border, Light Blue tint at 32% fill. Use `role="radio"` within a
  `role="radiogroup"` and arrow-key movement.
- Continue button stays disabled until a selection exists.
- Description over one line? Put the rest behind "More about this type" (level 2).

## Progress

| Pattern | Use | Look |
|---|---|---|
| Bar | Overall plan or path progress | 6px pill, Light Blue 32% track, True Blue fill, label above ("5 of 8 steps") |
| Step dots | Sequence inside a plan | 22px circles: done = Blue Green with check, current = CWRU Blue, upcoming = Light Gray outline |
| Score card | Report category scores | White card, label, Newsreader numeral "4 / 5" in CWRU Blue, level chip. Four in a row, never combined into one number |
| Ring | A single percentage that really exists (e.g. a plan's completion) | True Blue arc on Light Blue track; not for report scores |

HeroUI `Progress`: `classNames={{ track: "bg-light-blue/30", indicator: "bg-true-blue" }}`.

## Tabs

Underline style. Inactive muted, active CWRU Blue 600 with a 2px True Blue underline. Use for
In progress / Completed and Summary / Transcript.

```tsx
<Tabs variant="underlined" classNames={{
  cursor: "bg-true-blue",
  tabContent: "text-muted group-data-[selected=true]:text-cwru-blue group-data-[selected=true]:font-semibold",
}} />
```

## Inputs and errors

Label above (13px 600), 4px radius, 1px border at Dark Blue 30%, True Blue border plus 3px focus ring
at 20% on focus. Error text in Copper Red under the field and it says how to fix the problem:
"Enter a role, for example Product manager."

## Expandable section (level 2)

Use for per-competency feedback, rubric, rationale, full briefs. Closed by default; the summary line
names the content and its size so students can decide whether to open it.

```tsx
import { Accordion, AccordionItem } from "@heroui/accordion";
import { ChevronRight } from "lucide-react";

<Accordion selectionMode="multiple" variant="splitted" itemClasses={{
  base: "rounded-lg border border-line bg-white shadow-none",
  title: "text-[14.5px] font-semibold text-ink",
  subtitle: "font-mono text-xs text-muted",
  indicator: "text-true-blue",
}}>
  <AccordionItem key="influence" title="Influencing others" subtitle="3 moments · Developing"
    indicator={<ChevronRight className="size-4" />}>
    {/* rating, evidence quotes with mono timestamps, one suggestion */}
  </AccordionItem>
</Accordion>
```

Persist which items are open for the session (sessionStorage) so a reopened report keeps its state.
Print and PDF views open everything.

## Extractable section (level 3)

For content too long to read inline: full transcript, full feedback, case background. Check that the
page actually has the content first; the report page today shows no transcript, only a note that it
is saved, so adding a transcript panel there is a product change to propose, not a style fix.

- A summary card shows the title, size ("18 turns · 6 min read"), and actions:
  **Open in panel**, **Copy**, **Download**.
- The panel is a right-side drawer, 480px wide (full width under 640px), Raised surface, with its own
  scroll and a Close button. The page stays visible behind it so students keep their place.
  `@heroui/drawer` is not installed yet; add it, or use `@heroui/modal` with right placement styles.
- Copy uses `navigator.clipboard.writeText` and confirms with a toast ("Transcript copied").
- Download gives `.txt` for transcripts and `.pdf` for reports.

## Icons

`lucide-react`, 20px, `strokeWidth={1.5}`, color inherited. Icons sit beside a text label; icon-only
buttons need an `aria-label`. Suggested set: Mic, Video, Captions, PhoneOff (End), MessageSquare
(transcript), Sparkles (AI tip), ChevronRight (disclosure), Check, Download, Copy, PanelRight.

## Do and don't

| Do | Don't |
|---|---|
| Accordion row "Full transcript · 18 turns" | 2,000 words of transcript under the score |
| One primary per view | Primary buttons in every card of a list |
| Chip "Developing" with Orange dot | An unlabeled orange circle |
| Focus ring in True Blue at 3px | `outline: none` without a replacement |
| HeroUI component restyled with tokens | A hand-rolled duplicate of a HeroUI component |

## Sidebar

256px, flat CWRU Blue, 24px top padding, 28px between blocks.

| Part | Treatment |
|---|---|
| Mark and name | 40px white tile, radius 10, italic Newsreader "La" in CWRU Blue; "Leadership Avatar" Newsreader 20; "Weatherhead School of Management" 12px Light Blue |
| Group label | 12px sentence case, Light Blue: "Practice", "Progress" |
| Item | 44px tall, 18px Lucide icon at 1.5 stroke, 14.5px label at 88% white; hover a 10% white fill |
| Active item | White pill, radius 8, CWRU Blue 600 label, no shadow, `aria-current="page"` |
| Up next card | 8% white fill, radius 12: "Up next in your plan" and "Step 3 of 8" in 12px Light Blue, the step name 15/600, a 4px Light Blue progress bar, "Continue →". The whole card is one link |
| Logo | `public/cwru_wsom_logo.png` on a white plate, radius 8, max 200px wide, real alt text |
| Profile | 36px Light Blue initials circle, name 14/600, program 12px Light Blue, a 44px Settings icon button |

Settings lives on the profile row, not as a nav item. No glows, gradients, dot grid or count badges.

## Score panel and stat tiles

Peer figures share one white panel split by 1px dividers (`box-shadow: -1px 0 0` on each cell, so the
grid can wrap without double lines), never a row of separate cards with icons.

- **Score cell:** label 13/600 muted ("Content and structure"), figure Newsreader 40 ("2") with
  "/ 5" at 15px muted, then the level chip.
- **Stat cell** (Statistics tab): label 13/600 muted ("Speech rate"), figure Newsreader 36 with its
  unit at 14px muted ("138" "wpm"), a 6px bar, and one 13.5px line that says what the figure means
  ("Inside the interview target of 100–159 wpm"). A target range is a Blue Green band on the bar's
  track behind the True Blue fill. Rates say what they are per ("2.9 per minute").
- Statistics shows figures the report already has: speech rate, filler words, pauses, volume
  consistency, on camera, eye contact, framing, speaking time. Add a caption that names the basis
  ("Rates are per spoken minute").

## Takeaways columns

One white panel, three divided columns, each headed in Newsreader 22:
- **Keep doing:** each strength title (600) with its one-line detail; Blue Green 8px dot.
- **Work on next:** each growth area title with "Try this: [suggestion]"; Orange 8px dot.
- **Rewatch:** the answers at Uneven or Off, worst first, each a row link with a level dot, "Answer 6",
  why ("Off delivery, 6 filler words"), and its time in mono. Selecting one selects that point on the
  Moments timeline and scrolls to it.

## Moments timeline

The report's closing section on the flat Dark Blue stage, radius 16.

- **Heading:** Newsreader 26 "Moments" and one sentence ("How each of your 8 answers went. Select a
  point to see what happened."). Legend on the right: Delivery line, Camera moment, Cited in a growth
  area, and an "Example data" chip while data is sample.
- **Chart:** SVG `viewBox="0 0 1000 340"` in a box with `aspect-ratio: 1000 / 340` (uniform scaling,
  no stretched strokes), min-width 620px with horizontal scroll below that. X is session time with
  5 even ticks in mono; Y is delivery per answer in four labelled levels (Strong, Steady, Uneven, Off)
  on faint gridlines. Light Blue 2.5px line in straight segments; a True Blue area fading to clear
  under it. A camera strip below the plot marks camera episodes as Orange bars.
- **Points:** one per answer, colored by level (Strong Vivid Green, Steady Light Blue, Uneven Orange,
  Off Copper Red), each a real `<button>` with a 40px hit area positioned over the SVG, an
  `aria-label` ("Answer 6 at 4:10, Off") and `aria-pressed`. Selected: 20px with a white ring and a
  dashed vertical guide. A growth-area citation adds an Orange diamond above the point.
- **Detail panel:** beside the chart (stacks under it below about 900px), `aria-live="polite"`: time
  range in mono, "Answer 6" in Newsreader 24 with its level chip, what happened as 3–4 bullets in
  words (pace, filler words, volume, camera), "What you said" with the transcript excerpt in italic
  serif, and the growth area that cites it. Previous and next buttons step through answers.
- **Motion:** the line draws once, the area fades in after it, the weakest point pulses. Nothing else.
- **Data needed:** per-answer times and voice measures already exist (`VocalMetrics.turns`), camera
  episodes exist (`VisualMetrics.episodes`), growth areas carry timecodes. Two things do not exist yet:
  a per-answer delivery level (a new word rule in `lib/metrics/bands.ts`, like the existing bands) and
  the transcript excerpt matched to each answer. Propose both as product changes before building.
