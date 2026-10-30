# Screen patterns and real product references

Each student surface below lists the frame, what is visible up front, what goes behind a click, and
real product screens from Mobbin to borrow from. Screenshots live in `screens/` next to this file;
open them with the Read tool when layout details matter. Links go to the screen on Mobbin.

The reference screens show structure, not style. Their colors, fonts, and illustrations belong to
those products; restyle everything with the Leadership Avatar tokens. Red-flag items ("Skip") are
patterns the product owner ruled out.

## Contents
- Home and app shell
- Practice type picker
- Camera and mic check
- Live avatar session
- Scored report
- Study plans, paths, and mastery
- Sidebar and shell character
- Report typography

---

## Home and app shell

Frame: App shell. Up front: one Continue card (last plan step or unfinished session) with Resume,
then recent reports. Behind a click: full report list, history.

Borrow:
- One "continue" card on top with a progress bar and a single Resume button.
- Left nav with grouped items: Practice / My Reports / Study Plans, Paths, Mastery / Settings.
- In progress / Completed tabs for My Reports and Study Plans.

Skip: streak counters, leagues, XP, upsell cards.

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| Coursera | `screens/h-coursera.webp` | https://mobbin.com/screens/18683325-d982-4756-b06e-4ed52c933b06 | Continue card with progress and next item |
| Uxcel | `screens/h-uxcel.webp` | https://mobbin.com/screens/e2def7c6-f7a3-4d84-81f7-6eae55ac7f07 | Grouped sidebar, one strong resume action (ignore streaks and leagues) |
| Codecademy | `screens/h-codecademy.webp` | https://mobbin.com/screens/2c023032-4345-4ff3-ab0d-98ee54730a0e | Tabs plus an expandable module list |
| Babbel | `screens/h-babbel.webp` | https://mobbin.com/screens/8f0fb298-840c-4448-86b6-f362af935599 | Serif greeting, Today vs Learning plan split |

## Practice type picker

Frame: App shell. Up front: a question heading ("What do you want to practice?"), one card per type
(Interviews, Case studies, Pitches, Networking, Courageous conversations), Continue. Behind a click:
longer type descriptions, scenario briefs.

Borrow:
- Heading as a question, equal cards with icon, name, one-line description.
- Single selection, one primary button below the grid; Continue disabled until chosen.
- Selected card: 2px True Blue border on Light Blue tint.

Skip: illustration-heavy cards; icons are enough.

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| User Interviews | `screens/k-userinterviews.webp` | https://mobbin.com/screens/a1af67c3-ddd5-4e2e-9155-fe6b3cd08108 | Closest match: four session types, navy CTA |
| Ghost | `screens/k-ghost.webp` | https://mobbin.com/screens/c5cc238d-2bdf-486d-856e-78fdb09599f0 | Clear selected state, full-width Continue |
| Cake Equity | `screens/k-cake.webp` | https://mobbin.com/screens/00538b25-9fc2-4298-a5e5-b7d6401191cc | Back / Next footer for multi-step setup |

## Camera and mic check

Frame: App shell, centered two-column card. Up front: live self-preview, camera / mic / speaker
selects, one consent sentence, Start. Behind a click: recording and storage policy, troubleshooting.

Borrow:
- Split layout: preview left (Stage surface), device rows and Start right.
- Device rows with icon, device name, chevron; mic level meter in Force Blue.
- Mic and camera toggles on the preview itself.
- Troubleshooting as a small dialog, not inline text.

Skip: dark studio themes for the whole page; only the preview is dark. Consent is never skippable or
pre-checked.

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| Descript | `screens/d-descript.webp` | https://mobbin.com/screens/8bfb1d11-54e8-49f3-8527-6460bdf6029f | Light, calm layout with one Join |
| Riverside | `screens/d-riverside.webp` | https://mobbin.com/screens/6dd94e20-f952-4b15-bbe1-996cea368cb6 | Toggles on the preview, device dropdowns |
| Preply | `screens/d-preply.webp` | https://mobbin.com/screens/2efc7d2a-3947-401d-a39d-f0d41b3abfc5 | "Test your devices" troubleshooting dialog |

## Live avatar session

Frame: Session. Up front: avatar stage, practice type and scenario, turn counter, timer (mono), mic,
camera, captions, End. Behind a click: transcript and coach-tips panel (collapsible).

Borrow:
- Stage about 2/3 width on Dark Blue; transcript / tips panel on the right.
- Bottom control bar with labeled icons; End in Copper Red, set apart on the right.
- Speaker-labeled transcript turns with mono timestamps.
- Coach tips docked in the panel with the Violet AI label, never over the avatar's face.

Skip: reactions, participant lists, sharing controls; this is a one-on-one rehearsal.

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| Dialpad | `screens/s-dialpad.webp` | https://mobbin.com/screens/8ada6545-583d-436a-b58b-5714a49967b3 | Side panel plus labeled control bar, End isolated |
| Grain | `screens/s-grain.webp` | https://mobbin.com/screens/5566a752-8947-4c92-9081-e1559d5d7fb0 | Speaker-labeled transcript, talk-time bars |
| Codecademy | `screens/s-codecademy.webp` | https://mobbin.com/screens/87173dbe-18c9-451b-b8ae-9b49e0baf283 | AI mock interview: back link, scenario title, mic button |
| Otter AI | `screens/s-otter.webp` | https://mobbin.com/screens/01981d27-dce2-4dce-a344-3cb6185da831 | Timestamped turns, Summary / Transcript tabs |
| MasterClass | `screens/s-masterclass.webp` | https://mobbin.com/screens/954b6247-a0dc-4ac3-8d31-e9e1eeaf8681 | Coach panel docked beside video |

## Scored report

Frame: Report (see `layout.md` for the diagram and the rules the code enforces). Up front: four
category score cards with level words, "One thing to practice next time", Practice again, and in the
Overview tab a 2-sentence summary plus collapsed Strengths and Growth-area rows with source and
timecode chips. Behind a click: row detail, evidence quotes, suggestions, Delivery and Content tab
detail, the Moments timeline.

Borrow:
- Score first, words beside numbers (Codecademy's level word, not its single ring).
- Strengths and growth areas side by side as equal columns.
- Per-item rating with evidence and a timestamp (Grain).
- Labeled bars for band words in Delivery, without raw numbers.
- Radar chart only on Mastery, where trends across sessions matter.

Skip: a single combined score or 0–100 ring (the report deliberately has none), percentile curves
against other students, long narrative blocks shown open, and "Build study plan" on a single report
(plans are built from many reports on My Reports).

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| Codecademy | `screens/r-codecademy.webp` | https://mobbin.com/screens/f2d6f9fc-6557-4143-ae80-bdd4297032c6 | Level word beside the score, Strengths vs Improvement (not its single ring) |
| Grain | `screens/r-grain.webp` | https://mobbin.com/screens/935c8872-3616-4fff-aec9-89d327f23b7c | Per-skill 1 to 5 rating with evidence and timestamp |
| Uxcel | `screens/r-uxcel.webp` | https://mobbin.com/screens/7eae8d36-5100-4ad8-a241-f3d0bdac6cde | Labeled skill bars with x/100 values |
| 15Five | `screens/r-15five.webp` | https://mobbin.com/screens/1d575d26-986d-4126-9c12-2dd26aa3d0b3 | Leadership competency radar for Mastery |
| Charma | `screens/r-charma.webp` | https://mobbin.com/screens/6decba45-48e2-46c9-bd73-6e45483a9cc2 | Narrative per competency with tags (put behind expanders) |

## Study plans, paths, and mastery

Frame: App shell. Up front: progress bar, current step with Start step, step dots. Behind a click:
step rationale, completed history, milestone detail.

Borrow:
- Sectioned curriculum: each section with a small progress ring and steps typed as Drill,
  Knowledge check, or Coached practice.
- Step dots: done = Blue Green check, current = CWRU Blue, upcoming = outline.
- Learn, Practice, Master as a frame for a plan.
- Milestone checklist under each competency on Mastery.
- Numbered chapters with durations and the current row highlighted.

Skip: locked levels, "complete the previous level first" gating, XP. Every step stays open.

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| Codecademy | `screens/p-codecademy.webp` | https://mobbin.com/screens/63e05256-8dd3-4758-9abd-bc84176be27d | Section card with per-item progress rings |
| Headspace | `screens/p-headspace.webp` | https://mobbin.com/screens/81a53f98-3a1e-4b83-bfdb-35089dd9bd00 | Learn, Practice, Master step dots |
| Magnific | `screens/p-magnific.webp` | https://mobbin.com/screens/4b0d7119-a2fc-4ddc-8291-b3cacf949237 | Numbered chapters, durations, current row |
| Base44 | `screens/p-base44.webp` | https://mobbin.com/screens/aa7aea9d-42a2-4900-91fd-9ba2e8e1be19 | Milestone checklist under a progress bar (ignore locks) |
| Brilliant | `screens/p-brilliant.webp` | https://mobbin.com/screens/34856cb4-4cb0-4248-ab60-d1d4bf64b665 | "Start here" marker on a short path |

## Finding more references

If the Mobbin connector is available, search web screens with a plain query naming one screen type,
for example "AI mock interview session" or "skill assessment report". Add useful finds to this file
with their Mobbin link and what to take from them.

## Sidebar and shell character

Borrow:
- A card for the one thing to continue, inside the sidebar (Unity's current pathway).
- Sentence-case group labels splitting learning from progress (Uxcel's Learn / Grow).
- A profile row at the foot with the account's name and a settings control (Claude).
- A strong single-color sidebar that stays flat (Revolut's navy, without its glow).

Skip: glows and gradients in the sidebar, upsell cards, count badges on items that are not queues.

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| Unity | `screens/n-unity.webp` | https://mobbin.com/screens/7358492a-b314-4424-bf61-b29c43899f77 | Current pathway card at the top of the nav |
| Uxcel | `screens/n-uxcel.webp` | https://mobbin.com/screens/b035ca98-fdb7-4998-8074-7894028569a6 | Grouped nav with plain labels |
| Revolut Business | `screens/n-revolut.webp` | https://mobbin.com/screens/14dedbb5-61cc-4ef0-895d-a75d7a92767e | A confident navy chrome (ignore the glow) |
| Claude | `screens/n-claude.webp` | https://mobbin.com/screens/2243670f-921d-46eb-9ce2-eb24199ba09c | Profile row with plan at the foot of the sidebar |

## Report typography

| App | Screenshot | Mobbin | Take from it |
|---|---|---|---|
| Ferndesk | `screens/t-ferndesk.webp` | https://mobbin.com/screens/4a21372c-f255-4f27-a0ed-73c2e251bc3d | Serif figures in a divided metric panel, labels in sans |
| The New York Times | `screens/t-nyt.webp` | https://mobbin.com/screens/0cc2c76b-9a57-43ea-89be-5f3838813af1 | A serif title with a plain sans line under it (skip the italic headline) |
