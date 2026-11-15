# Orange accent audit (2026-11-14)

The accent is `--la-accent` (#FF9239), added in PR #102. The audit was run on origin/dev (e781f25) at
1440x900, signed in as alice.johnson@case.edu, with admin@example.com and professor.smith@case.edu for
the staff home. It reads each element's computed color, background, border and `::after` for
rgb(255, 146, 57). The level-2 status orange uses the same hex, so status chips, Mastery level badges
and the courageous-conversation difficulty meter showed up too. They are status, not accent, and are
left out of the table below.

The sidebar's active-item marker is on every page, so it's left out of the table. Its up-next card
showed the progress fill in Orange everywhere except Mastery, where it was Light Blue with a white
"Continue" arrow.

## Before (origin/dev)

| Page | Header type | Accent today | Gap |
|---|---|---|---|
| /practice | plain | title rule; Orange tile icons | — |
| /practice/interviews | hero (`PracticeHero`) | none | no rule under hero title; General / Industry card icons are blue |
| /practice/interviews/industry-specific | hero | none | no rule; 7 card icons blue |
| /practice/interviews/technical (setup wizard) | none (step tracker) | none | no page header at all (session-wizard frame); left as is |
| /practice/interviews/customize/[slug] (setup wizard) | hero | none | no rule |
| /practice/pitches | hero | none | no rule; Elevator / Deck / Sales card icons blue |
| /practice/pitches/deck | hero | none | no rule; 5 deck-mode icons white on blue tiles |
| /practice/pitches/elevator (setup wizard) | hero | none | no rule |
| /practice/sales-discovery | plain | none | no rule; card discipline icons blue |
| /practice/networking (setup wizard) | hero | none | no rule; "Pick someone" / "Bring in someone real" icons blue |
| /practice/courageous-conversations | plain | none | no rule (cards use avatars, no icons) |
| /practice/clinical-communication | plain | none | no rule; card icons blue |
| /practice/motivational-interviewing | plain | none | no rule; card icons blue |
| /practice/case-studies | plain | none | no rule (cards use avatars) |
| /reports | plain | title rule | — |
| /reports/[id] (report) | plain (report header) | practice-next target | no rule under the report title |
| /study-plans | plain | title rule | — |
| /study-plans/[id] | band (CWRU Blue) | none | no rule under the band title |
| /paths | plain | title rule | — |
| /mastery | band | none in body (correct) | sidebar up-next fill switched to Light Blue and the arrow to white; the user read that as an inconsistency |
| Session briefing / live session | session frame | none | out of scope; the session frame has no page title |
| Admin / professor home (/) | centered staff home | sidebar marker only | staff pages aren't in the accent rules; the home's cards mix a blue tinted tile and a green icon (separate issue) |

In short, 4 of the 19 student page headers had the rule, and only the plain headers. No hero header had
it. Card icons were Orange on /practice and blue on every sub-picker.

## After (this branch, level "a")

| Page | Accent | Comes from |
|---|---|---|
| every plain student header (practice, reports, report, study plans, paths, persona lists, courageous conversations, case studies, write/edit pages) | title rule | `components/shell/PageTitle` |
| every hero header (interviews, industry, pitches, deck, elevator, networking, customize) | title rule (Orange on CWRU Blue, 5.7:1) | `PracticeHero` |
| study plan detail band | title rule | `.la-title-rule` on its h1 |
| every live picker card icon (/practice, interviews, industry, pitches, deck, networking, sales, clinical, MI) | Orange icon | `.la-card-icon` |
| sidebar (all pages, Mastery included) | marker, up-next fill (or arrow at 0%) | `auth-navbar`, `UpNextCard` (the `accent` prop is gone) |
| report | practice-next target | `ReportBody` |
| Mastery body | none | no `PageTitle`; guarded by `e2e/accent-consistency.spec.ts` |

Options "b" and "c" are switched with `ACCENT_LEVEL` in `lib/brand/accent.ts` (`data-accent-level` on
<html>):

- **b**: the active tab underline is Orange (`.la-tab` on study plans, courageous conversations and
  case studies; `.la-tab-cursor` on the report tabs). The selected tab also has a semibold CWRU Blue
  label, so the underline is never the only signal.
- **c**: a 3px Orange top edge on the featured panel (`.la-featured`: the report's practice-next panel
  and the "Build a self-paced study plan" panel), plus an Orange ledge under the hero icon tile
  (`.la-hero-tile`).

## Contrast

| Pair | Ratio | Note |
|---|---|---|
| Orange on white | 2.2:1 | decorative only; never text, focus or the only state signal |
| Orange on Canvas | 2.1:1 | same |
| Orange on CWRU Blue | 5.7:1 | hero title rule, sidebar marker and fill |
| True Blue focus ring on white / Canvas | 4.7:1 / 4.4:1 | focus stays True Blue at every level (≥ 3:1) |
| Light Blue focus ring on CWRU Blue (sidebar) | 7.8:1 | unchanged |
