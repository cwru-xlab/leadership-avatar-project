# Layout, spacing, surfaces, and textures

## The three frames

Every student screen uses one of these. A fourth frame needs a reason that the student would notice.

### App shell
```
+--------+----------------------------------------------+
|        | Page title (Newsreader 28)       [action]    |
| CWRU   | Tabs                                         |
| Blue   +----------------------------------------------+
| nav    | Level-1 card (e.g. Continue · Resume)        |
| 240px  | Content, max 1080px, 12-col grid, 24 gutter  |
+--------+----------------------------------------------+
```
Used by Home, Practice picker, Reports list, Study Plans, Paths, Mastery, Settings.
Nav groups: Practice; My Reports; Study Plans, Paths, Mastery; Settings at the bottom.

### Session
```
+-------------------------------------------------------+
| Type · Scenario            Turn 4 of 8 · 01:30  [End] |
+-----------------------------------+-------------------+
|                                   | Transcript | Tips |
|         Avatar stage (2/3)        |  (1/3, collapsible)|
|                                   |                   |
+-----------------------------------+                   |
| Mic · Camera · Captions     ···   End (Copper Red)    |
+-----------------------------------+-------------------+
```
Sidebar collapses to 72px or hides. Below 1024px the panel moves under the stage. The device check
uses the shell with a centered two-column card: preview left, device selects and Start right.

### Report

Lives in the app shell. Real files: `app/practice/[type]/report/[reportId]/page.tsx`,
`components/report/ReportBody.tsx`, `components/interview/ReportScoreCards.tsx`.
```
+-------------------------------------------------------+
| <- My reports                                         |
| Your interview report (32px serif) [Practice again]   |
| (o) Behavioral interview with [name] · [date] · AI    |
+-------------------------------------------------------+
| Visual 4/5   | Vocal 3/5    | Content 2/5 | Behav. 4/5|  one panel, dividers
| (Strong)     | (Solid)      | (Developing)| (Strong)  |
+-------------------------------------------------------+
| (target) One thing to practice next time              |  Light Blue tint
|          "Italic statement, one sentence"             |
+-------------------------------------------------------+
| Overview | Takeaways | Statistics | Delivery | Content|
|  Overview:   summary; Strengths | Growth areas rows   |
|  Takeaways:  Keep doing | Work on next | Rewatch      |
|  Statistics: 8 figures in one divided panel           |
+-------------------------------------------------------+
| Moments (flat Dark Blue)                              |
|  line chart: delivery per answer over time   | detail |
|  camera-moment strip under it                | panel  |
+-------------------------------------------------------+
```
Tabs carry what the student chooses to read; the timeline closes the page so the screen has no empty
tail and every growth area and rewatch item can jump to it (`href="#moments"` plus selecting the
point).
Rules the code already enforces, which the design keeps:
- No combined score. Four category cards, in fixed order, titles copied from the rubric.
- Score cards never show raw metric numbers; `lib/metrics/bands.ts` turns numbers into words.
- "One thing to practice next time" is the only tinted panel on the page.
- Tabs with no data are dropped, never shown empty.
- Camera observations are muted and labeled as unscored, at the end of Delivery.
- Reports made before structured data fall back to markdown; pending and failed states keep their
  skeleton and "transcript is saved" message.
- Study plans are built from many reports on My Reports, so the report's primary action is
  "Practice again", not "Build study plan".

## Grid and sizing

| Spec | Value | Notes |
|---|---|---|
| Sidebar | 240px, 72px collapsed | Collapsed on session screens and below 1024px |
| Content width | max 1080px | Reading blocks max 65ch inside it |
| Grid | 12 columns, 24px gutter | 16px gutter below 768px |
| Page padding | 32px, 16px on mobile | 32px from top of page to title |
| Breakpoints | 640, 768, 1024, 1280 | Tailwind defaults `sm md lg xl` |
| Kiosk | 1920x1080, no sidebar | Type x1.25, touch targets 56px |
| Touch target | 44px minimum | Existing `spacing.touch` token |

## Spacing scale

4, 8, 12, 16, 24, 32, 48, 64 px (`gap-1 gap-2 gap-3 gap-4 gap-6 gap-8 gap-12 gap-16`).

- 12 inside a card between rows
- 16 between related groups
- 24 card padding on desktop, 16 on mobile
- 32 between page sections

Use flex or grid `gap`. Margins on siblings collapse or double unpredictably, which is how the current
pages drifted apart.

## Layout rules

- Left-aligned. Center content only on empty states and the kiosk attract screen.
- One primary action per view, at the end of the flow or bottom-right of its card.
- Summary above detail. The first 600px answer "where am I and what do I do next."
- Cards hold one object (a session, a step, a report). No cards inside cards.
- Let grids fill rows: pick column counts the items fill, and avoid a single orphan card in a row.

## Surfaces

| Surface | CSS | Where |
|---|---|---|
| Canvas | `background: #F5F8FB` | Page background |
| Surface | `background: #fff; border: 1px solid rgb(9 20 58 / .14); border-radius: 8px` | Cards, disclosures |
| Raised | Surface plus `box-shadow: 0 12px 32px rgb(9 20 58 / .16)` | Menus, dialogs, drawers only |
| Stage | `background: #09143A; border-radius: 12px` (16px for the Moments panel) | Avatar video area and the report's Moments timeline |

Depth means "this floats above the page." Shadows on resting cards make everything compete.

## Textures

Textures are CSS, never images, and never sit behind body text.

| Texture | CSS | Where |
|---|---|---|
| Dot grid | `background-color: #003071; background-image: radial-gradient(rgb(166 210 230 / .35) 1px, transparent 1.2px); background-size: 12px 12px;` | Login and kiosk attract screen only; never the sidebar or app panels |
| Hatch | `background: repeating-linear-gradient(135deg, #fff 0 6px, rgb(9 20 58 / .06) 6px 7px);` | "Not started" or "No data yet" placeholders |

## Radius and motion

| Token | Value | Where |
|---|---|---|
| `rounded-sm` | 4px | Inputs, small tags |
| `rounded-lg` | 8px | Cards, buttons, disclosures |
| `rounded-xl` | 12px | Dialogs, avatar stage |
| `rounded-full` | 999px | Status chips, progress tracks |

Motion: 150ms ease-out for hover, 200ms for expand and collapse, nothing longer. Wrap in
`motion-safe:` or check `prefers-reduced-motion`.
