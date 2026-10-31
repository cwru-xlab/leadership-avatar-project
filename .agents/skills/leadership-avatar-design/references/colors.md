# Colors

Values come from CWRU Visual Identity (https://case.edu/brand/visual-identity/color). Don't alter the
hex values or add new colors; the guidelines prohibit unapproved colors. Derived values in this file
are opacities of Dark Blue or tints of Light Blue, which keep the palette intact.

## Palette and jobs

### Brand blues
| Name | Hex | Pantone | Job in the app |
|---|---|---|---|
| CWRU Blue | `#003071` | PMS 2146 C | Sidebar, primary button, page titles, score numeral |
| CWRU Dark Blue | `#09143A` | PMS 2768 C | Body text, avatar video stage |
| CWRU True Blue | `#007AB8` | PMS 2382 C | Links, focus ring, active tab, progress fill, selected border |
| Force Blue | `#2359EF` | PMS 2386 C | Live signals only |
| CWRU Light Blue | `#A6D2E6` | PMS 291 C | Selected tint (32%), progress track, transcript highlight |

### Neutrals
| Name | Value | Job |
|---|---|---|
| White | `#FFFFFF` | Cards and surfaces |
| Canvas | `#F5F8FB` | Page background (Light Blue at about 10% over white) |
| Line | `rgb(9 20 58 / .14)` | Borders and dividers |
| Muted | `rgb(9 20 58 / .68)` | Secondary text |
| Light Gray | `#D3D3D3` | Empty step outlines |
| Dark Gray | `#999999` | Disabled controls only |

### Tertiary (status, 5% of any screen)
| Name | Hex | Meaning | Text treatment |
|---|---|---|---|
| Vivid Green | `#61A530` | Level 5 (Excellent / Mastered) | Dark Blue text on tint; never white text |
| Blue Green | `#377E72` | Level 4 (Strong), completed step | White on solid passes |
| Orange | `#FF9239` | Level 2 (Developing / Building) | Dark Blue text; never white text |
| Copper Red | `#D63D1F` | Level 1 (Needs work / Starting out), errors, End session | White on solid passes |
| Violet Purple | `#692C95` | AI-generated content label | Violet text on 8% violet tint |

Level 3 (Solid / Competent) uses Light Blue, a secondary color, so the middle of the scale reads as
neutral rather than as a warning. The full ramp with both label sets is in `SKILL.md`.

## Usage rules, with reasons

- **CWRU Blue is always present.** CWRU's guidelines say secondary and tertiary colors never appear
  without CWRU Blue. The sidebar guarantees it on shell screens; full-screen views (session, kiosk)
  carry it in the top strip.
- **True Blue is the only interactive color.** Students learn that True Blue means "you can act on
  this." Using it for decoration breaks that signal.
- **Force Blue means "happening now."** If nothing is live, it is not on screen. That keeps the live
  indicator meaningful during a stressful session.
- **Tertiary colors mark status only, always with a word or icon.** About 8% of men have some color
  vision deficiency, and the levels must survive grayscale printing of reports.
- **Muted text is Dark Blue at 68%.** The brand has no mid-gray text color, and `#999999` is 2.8:1.
- **No gradients except the stage.** The old orange-pink-violet avatar gradient is retired.

## Accessible pairings

| Pairing | Contrast | Use |
|---|---|---|
| CWRU Blue on white | 12.6:1 | Titles, text links on light |
| White on CWRU Blue | 12.6:1 | Sidebar, primary buttons |
| Dark Blue on white | 18:1 approx. | Body text |
| True Blue on white | 4.7:1 | Links, active tab label |
| White on Blue Green | 4.8:1 | Done-step icon |
| White on Copper Red | 4.6:1 | End session, destructive buttons |
| Dark Blue on Orange | 8.0:1 | Level 2 chip |
| Dark Blue on Vivid Green | 5.9:1 | Level 5 chip |
| Dark Gray on white | 2.8:1 | Fails. Disabled only |
| Light Blue on white | 1.5:1 | Fails. Fill only |

## Off-brand values in this codebase

Replace these when touching the files. Check for new ones with
`grep -rnE '#[0-9a-fA-F]{6}' app components styles tailwind.config.mjs`.

| Today | Where | Replace with |
|---|---|---|
| `#003087` | `tailwind.config.mjs` `weatherhead.primary` | CWRU Blue `#003071` |
| `#102331` | Practice pickers (navy ink) | Dark Blue `#09143A` |
| `#0a7391` | Practice pickers (Weatherhead teal) | True Blue for actions, Blue Green for status |
| `#082b4c`, `#142c3f` | `styles/globals.css` `--report-navy`, `--report-ink` | Dark Blue |
| `#0066a6`, `#004b7a` | `styles/globals.css` `--report-blue`, `--report-blue-deep` | True Blue, CWRU Blue |
| `#a97928`, `#f4ecdc` | `styles/globals.css` `--report-gold`, `--report-gold-pale` | Orange, Orange at 16% tint |
| `#cbd9e1`, `#526b7b` | `styles/globals.css` `--report-line`, `--report-muted` | Line, Muted tokens |
| `avatar-gradient` | `tailwind.config.mjs` | Remove; use the Stage surface |
| `#22c55e` | `tailwind.config.mjs` `weatherhead.badgeGreen` | Vivid Green or Blue Green by meaning |
| HeroUI default blue | Admin screens | Map HeroUI `primary` to CWRU Blue (see `tokens.md`) |

## Examples

Good: a report score row. Four white cards, each with a CWRU Blue numeral ("2 / 5") and one level
chip ("Developing": Orange dot, 16% Orange tint, Dark Blue word). The "One thing to practice next
time" panel in Light Blue tint, and a CWRU Blue "Practice again" button in the header.

Bad: a picker where each practice type card has its own color (orange interviews, green pitches,
purple networking). Color stops meaning anything, and tertiary colors appear as chrome.
