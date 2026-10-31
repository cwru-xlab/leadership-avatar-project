---
name: leadership-avatar-design
description: >-
  House design system for the Leadership Avatar app (CWRU Weatherhead AI avatar practice kiosk).
  Gives the CWRU brand colors, typography, spacing, layout frames, textures, UI component treatments,
  progressive-disclosure text rules, real reference screens from Mobbin, do's and don'ts, and a review
  checklist. Use this whenever you design, build, restyle, polish, critique or review any screen or
  component in this repository: practice pickers, device check, live avatar session, reports, study
  plans, paths, mastery, settings, the sidebar or app shell, kiosk or login. Also use it for Tailwind or
  HeroUI theme work, color or font changes, and whenever a page has too much text, looks off-brand,
  inconsistent, or "like three different products." Prefer this skill over generic frontend or
  design-taste skills for anything inside this app.
---

# Leadership Avatar design system

Leadership Avatar lets Weatherhead students rehearse high-stakes leadership conversations with an AI
avatar, read a scored report, then follow a study plan. Students use it at a desk or a lab kiosk, often
right before or after something stressful. The design job is to make the next step obvious in a glance,
and to make Practice, Reports, and Paths read as one product.

The source of truth is the brand guideline PDF in `assets/leadership-avatar-brand-guidelines.pdf`.
This file distills it into rules; the `references/` files hold the detail. Precedence when things
conflict: the user's words, then CWRU brand standards, then this skill, then `PRODUCT.md`, then
existing HeroUI defaults.

## The five rules

1. **CWRU Blue leads.** `#003071` appears on every screen, through the sidebar, page titles, and the
   primary button. CWRU's guidelines forbid secondary or tertiary colors without CWRU Blue in view.
2. **Color means something.** Color marks data, status, or the one primary action. Chrome stays
   white, canvas, and blue. Tertiary colors are only for competency status, errors, and AI labels.
3. **Show less, reveal more.** Keep visible text short. Anything long goes in an expandable section or
   an extractable one (side panel, copy, download). This is a standing goal from the product owner.
4. **One shell, one scale.** Every student screen uses one of three layout frames, one type scale, and
   the 4px spacing scale. A one-off color, size, or layout is a defect, not a style choice.
5. **Accessible by default.** Text contrast of at least 4.5:1, full keyboard use with a visible focus
   ring, status never shown by color alone, and explicit camera and mic consent before a session.

## Workflow for any design task

1. Identify the surface (home, picker, device check, session, report, plans/paths/mastery, settings)
   and pick its frame from the table below. Then read the existing component and its header comments
   and the data it renders. Those comments record deliberate product decisions (for example "no
   combined score", "never format a raw metric number"); they outrank this skill's generic patterns,
   because the patterns describe a look, not the product's rules. Design around the real data shape,
   including legacy, pending, failed, and empty states.
2. Read `references/patterns.md` for that surface. It lists what to borrow from real products, what to
   skip, and the reference screenshots in `references/screens/`. Open the images when layout matters.
3. Decide the text levels before writing markup: what is visible (level 1), what expands (level 2),
   what opens in a panel or file (level 3). See `references/content.md`.
4. Build with tokens only (`references/tokens.md`) and the component treatments in
   `references/components.md`. Never type a raw hex value into a component.
5. Run the checklist at the bottom of this file and fix anything that fails before calling it done.

## Quick reference

### Color roles

| Token | Hex | Job | Text on white? |
|---|---|---|---|
| CWRU Blue | `#003071` | Sidebar, primary button, titles, score numeral | Yes, 12.6:1 |
| Dark Blue | `#09143A` | Body text, avatar video stage | Yes |
| True Blue | `#007AB8` | Links, focus ring, active tab, progress fill, selected border | Yes, 4.7:1 |
| Force Blue | `#2359EF` | Live signals only (avatar speaking, recording, your-turn timer) | Yes |
| Light Blue | `#A6D2E6` | Selected tint, progress track, highlights | No, fill only |
| Canvas | `#F5F8FB` | Page background | n/a |
| Line | Dark Blue at 14% | Borders, dividers | n/a |
| Muted text | Dark Blue at 68% | Secondary text | Yes |
| Light / Dark Gray | `#D3D3D3` / `#999999` | Empty steps / disabled only | No |
| Vivid Green | `#61A530` | Level 5, done-and-mastered | No, Dark Blue text on it |
| Blue Green | `#377E72` | Level 4, completed step | Yes, 4.8:1 |
| Orange | `#FF9239` | Level 2 | No, Dark Blue text on it |
| Copper Red | `#D63D1F` | Level 1, errors, End session | Yes, 4.6:1 |
| Violet Purple | `#692C95` | "AI" label on model-written text | Yes |

### Level ramp

The app has two real 5-point scales. Both use one color ramp, so a student learns it once. Always
show the word; the dot and tint are a second signal.

| Level | Report score label (`ReportScoreCards`) | Mastery label (`lib/mastery/levels.ts`) | Dot | Chip tint |
|---|---|---|---|---|
| 5 | Excellent | Mastered | Vivid Green | Vivid Green 16% |
| 4 | Strong | Strong | Blue Green | Blue Green 16% |
| 3 | Solid | Competent | Light Blue | Light Blue 32% |
| 2 | Developing | Building | Orange | Orange 16% |
| 1 | Needs work | Starting out | Copper Red | Copper Red 12% |
| none | Not yet measured | Not yet measured | Light Gray outline | Hatch texture |

Take the labels from those files rather than retyping them, so the UI can't drift from the scoring.

Brand proportions: CWRU Blue 45%, True + Force Blue 20%, Light Blue 10%, Dark Blue 10%, neutrals
10%, tertiary 5%. In a white app, reach the 45% through the sidebar, titles, and primary buttons, not by
painting content areas blue. Full detail, pairings, and migration table: `references/colors.md`.

### Typography

| Role | Face | Size / line height | Weight |
|---|---|---|---|
| Page title | Newsreader | 32 / 1.1 | 500 |
| Score and stat figures | Newsreader | 36–40 / 1.0 | 500 |
| Section heading | Newsreader | 22–26 / 1.15 | 500 |
| Statement (practice-next line, evidence quotes) | Newsreader italic | 16–24 / 1.35 | 400 |
| Body | Public Sans | 15–17 / 1.55 | 400 |
| Label | Public Sans, sentence case | 13 / 1.3 | 600 |
| Small | Public Sans | 12.5–13 / 1.45 | 400 |
| Time | IBM Plex Mono | 12.5–13 / 1.5 | 400 |

Newsreader carries the moments a student reads: the page title, section headings, score and stat
figures, and statements (the practice-next line, evidence and transcript quotes, in italic). Never on
buttons, tabs, labels, chips, tables or forms. Italic is for whole statements, never one accent word
in a heading. Sentence case everywhere, labels included; no tracked uppercase. IBM Plex Mono is for
timestamps and time ranges only. Reading text
max 65ch. Tabular figures for numbers in columns and timers. Kiosk scales everything by 1.25.
Detail and the Next.js font setup: `references/typography.md`.

### Spacing, radius, surfaces

- Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64. Inside a card 12, between related groups 16, between
  sections 32. Use `gap`, not margins.
- Radius: 4 inputs and tags, 8 cards and buttons, 12 dialogs and the video stage, pill for status chips.
- Surfaces: Canvas page, Surface (white, 1px line, no shadow) for cards, Raised (shadow
  `0 12px 32px rgb(9 20 58 / .16)`) only for menus, dialogs, drawers. Stage is flat Dark Blue, for the
  avatar video and the report's Moments timeline. Dot grid only on login and kiosk screens, never in
  app chrome. Hatch for "not started."
- Motion: 150ms ease-out hover, 200ms expand, off under `prefers-reduced-motion`. What may move and
  what may not is under "Motion" below.

Detail: `references/layout.md`.

### Layout frames

| Frame | Used by | Shape |
|---|---|---|
| App shell | Home, Practice picker, Reports list, Study Plans, Paths, Mastery, Settings | 240px CWRU Blue sidebar, content max 1080px, title then tabs then content |
| Session | Device check (centered card variant), live avatar session | Sidebar collapses; top strip; stage 2/3 + transcript/tips panel 1/3; control bar with End on the right |
| Report | Report detail (`app/practice/[type]/report/[reportId]`) | App shell; header with back link, title, and "Practice again" as the one primary; one score panel split into four category scores (1–5 with level word, never a combined score); the "One thing to practice next time" panel; tabs Overview / Takeaways / Statistics / Delivery / Content; the Moments timeline as the closing section below the tabs |

Every frame is designed for a 1440×900 desktop first: on screens 900px and wider the sidebar stays
fixed at full height and only the content column scrolls. Below 900px the sidebar moves to the top and
the page scrolls as one.

### App shell and sidebar

The sidebar is the screen's brand moment, so it carries character through content, not decoration:
flat CWRU Blue; the product mark (a white tile with an italic "La") beside "Leadership Avatar" and
"Weatherhead School of Management"; sentence-case group labels in Light Blue ("Practice", "Progress");
18px outline icons beside every label; the active item as a white pill with CWRU Blue text and no
shadow; an "Up next in your plan" card (the next study-plan step, its progress, "Continue →"); the
official Weatherhead logo on a white plate (`public/cwru_wsom_logo.png`; it disappears on blue without
one); a profile row with initials, name, program and a Settings button. No glows, gradients, dot grid,
or count badges unless the count is a queue that needs action.

### Motion

Motion is feedback or it points at something. Allowed:
- Hover and press feedback on rows, links and buttons (150ms).
- The Moments line drawing in once on load, its area fading in after it.
- A pulse on the one point that needs attention (the weakest answer). This is the only infinite loop
  on a screen.
- A ripple on the practice-next target that plays twice and stops.

Not allowed: staggered card entrances, fade-up on every block, decorative loops, bounce easing.
Everything stops under `prefers-reduced-motion`.

### Text budget (rule 3)

- Page title: 8 words or fewer.
- Any visible summary: 2 sentences or fewer.
- Lists: 3 items visible, then "Show all."
- One primary action per view.
- Never hide errors, required consent, deadlines, or the primary action.

## Do and don't

| Do | Don't |
|---|---|
| One CWRU Blue primary button per view | Color buttons with Orange, Green, or Violet |
| Status chip with dot, tint, and the word ("Developing") | Status shown by color alone |
| Muted text as Dark Blue at 68% | Text in `#999999`, Light Blue, Orange, or Vivid Green |
| Force Blue only while something is live | Force Blue as a decorative accent |
| Long feedback in an expandable row with a size hint ("18 turns") | Paragraph walls on reports or setup screens |
| Full transcript in a side panel with Copy and Download, where the page has one | Transcript dumped inline under the report |
| Four category scores, each with its level word | A blended overall score or a 0–100 ring the scoring doesn't produce |
| Serif for the page title and score numerals only | Serif on buttons, labels, tables, or forms |
| Cards with a 1px line on canvas | Shadows on every card, or cards inside cards |
| Lucide icons, 20px, 1.5px stroke, beside a label | Emoji as icons or section markers |
| Steps that are all open | Streaks, XP, leagues, or locked levels (ruled out for paths) |
| Coach voice in first person, student as "you" | Marketing copy, eyebrows, testimonials, or invented stats in the app |
| Sentence-case labels at 13px | Tiny tracked uppercase or mono labels above headings and values |
| A heading in one face and one color | One italic or colored accent word in a heading |
| A label and a number, or one divided panel for peer figures | Icons in tinted squares on cards, KPIs or list rows |
| Flat fills; one fading area under a single line chart | Glow gradients on sidebars, panels or buttons |
| Straight line segments between real data points | Smoothed curves that invent values between answers |
| Sample figures that agree everywhere they appear | A stat that disagrees with the timeline or another tab |

## Reference files

Read only what the task needs.

- `references/colors.md`: full palette, contrast pairings, usage rules, and the table of off-brand
  values in this codebase with their replacements.
- `references/typography.md`: type scale, rules, and the `next/font` swap from Inter/Fira Code.
- `references/layout.md`: frames, grid, widths, breakpoints, kiosk, surfaces and textures in CSS.
- `references/components.md`: buttons, chips, signals, selectable cards, progress, tabs, inputs,
  expandable and extractable sections, with HeroUI + Tailwind examples.
- `references/content.md`: progressive disclosure levels, where each kind of content goes, voice and
  microcopy.
- `references/patterns.md`: each student surface with real product references (Mobbin links and local
  screenshots in `references/screens/`), what to borrow and what to skip.
- `references/tokens.md`: copy-ready CSS variables, Tailwind config, and HeroUI theme mapping.
- `assets/leadership-avatar-brand-guidelines.pdf`: the full guideline document.

For a cleanup pass ("make it less generic", "it looks sloppy"), the repo's
`.agents/skills/design-taste-frontend/references/app-screens.md` §13–14 lists the tells of generated
app screens. Apply it, except where it conflicts with CWRU's brand: the CWRU Blue sidebar, CWRU Blue
primary buttons, and the Violet AI label stay.

## Consistency checklist

Run this on every new or changed screen. Each item maps to a rule above.

- [ ] Uses the app shell, session, or report frame; no new layout.
- [ ] Keeps every rule in the component's header comments, and handles its legacy, pending,
      failed, and empty states.
- [ ] CWRU Blue is visible (sidebar or top bar) and is the only primary button color.
- [ ] Every color comes from a token; `grep -E '#[0-9a-fA-F]{6}'` on the changed files finds none.
- [ ] Tertiary colors appear only as status, errors, or the AI label, each with a word or icon.
- [ ] Type sizes and weights come from the scale; Newsreader only in its roles; no uppercase or
      mono labels; no accent word in a heading.
- [ ] No icons in tinted squares, glow gradients, decorative shapes, or shadows on resting cards.
- [ ] Motion only where the Motion list allows it, and all of it stops under reduced motion.
- [ ] Every figure shown twice comes from one value and agrees.
- [ ] Spacing uses 4/8/12/16/24/32/48/64 only, applied with `gap`.
- [ ] Within the text budget; long content is expandable or opens in a panel.
- [ ] Errors, consent, deadlines, and the primary action are visible without a click.
- [ ] Every interactive element is reachable by keyboard with a visible True Blue focus ring.
- [ ] Text passes 4.5:1 on its background (see pairings in `references/colors.md`).
- [ ] Works at 375px, 1024px, and the 1920x1080 kiosk; touch targets at least 44px.
- [ ] No streaks, XP, locks, gradients (other than the stage), emoji icons, or marketing copy.
