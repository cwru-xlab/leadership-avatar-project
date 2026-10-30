# Tokens: copy-ready

The project runs Tailwind 4 with the legacy JS config loaded by `@config "../tailwind.config.mjs"` in
`styles/globals.css`, plus the `heroui()` plugin. Put CSS variables in `globals.css` and point the
Tailwind config at them, so components, raw CSS, and HeroUI all read one source.

## CSS variables (`styles/globals.css`)

```css
:root {
  /* CWRU brand */
  --la-cwru-blue: #003071;
  --la-dark-blue: #09143A;
  --la-true-blue: #007AB8;
  --la-force-blue: #2359EF;
  --la-light-blue: #A6D2E6;

  /* neutrals */
  --la-surface: #FFFFFF;
  --la-canvas: #F5F8FB;
  --la-line: rgb(9 20 58 / 0.14);
  --la-muted: rgb(9 20 58 / 0.68);
  --la-gray-light: #D3D3D3;
  --la-disabled: #999999;

  /* levels 1-5 (CWRU tertiary; level 3 uses Light Blue) */
  --la-level-5: #61A530;
  --la-level-4: #377E72;
  --la-level-2: #FF9239;
  --la-level-1: #D63D1F;
  --la-ai: #692C95;

  /* surfaces */
  --la-shadow-raised: 0 12px 32px rgb(9 20 58 / 0.16);
  --la-stage: #09143A;
}

body { background: var(--la-canvas); color: var(--la-dark-blue); }
```

The app is light-only (dark mode was removed in the cohesion pass), so there is no dark block.

## Tailwind config (`tailwind.config.mjs`, `theme.extend`)

```js
fontFamily: {
  display: ["var(--font-display)", "Georgia", "serif"],
  sans: ["var(--font-sans)", "Arial", "sans-serif"],
  mono: ["var(--font-mono)", "ui-monospace", "monospace"],
},
colors: {
  "cwru-blue": "#003071",
  ink: "#09143A",
  "true-blue": "#007AB8",
  "force-blue": "#2359EF",
  "light-blue": "#A6D2E6",
  canvas: "#F5F8FB",
  line: "rgb(9 20 58 / 0.14)",
  muted: "rgb(9 20 58 / 0.68)",
  "level-5": "#61A530",
  "level-4": "#377E72",
  "level-2": "#FF9239",
  copper: "#D63D1F",
  ai: "#692C95",
},
boxShadow: { raised: "0 12px 32px rgb(9 20 58 / 0.16)" },
spacing: { touch: "44px" },
```

Hex values (not `var()`) in the Tailwind colors keep opacity modifiers like `bg-light-blue/30`
working. Remove `weatherhead.*` and `avatar-gradient` once nothing references them
(`grep -rn "weatherhead-\|avatar-gradient" app components`).

## HeroUI theme

Map HeroUI's semantic colors so existing HeroUI components, including admin screens, adopt the
brand without per-component edits:

```js
plugins: [
  heroui({
    themes: {
      light: {
        colors: {
          background: "#F5F8FB",
          foreground: "#09143A",
          primary: { DEFAULT: "#003071", foreground: "#FFFFFF" },
          secondary: { DEFAULT: "#007AB8", foreground: "#FFFFFF" },
          success: { DEFAULT: "#377E72", foreground: "#FFFFFF" },
          warning: { DEFAULT: "#FF9239", foreground: "#09143A" },
          danger: { DEFAULT: "#D63D1F", foreground: "#FFFFFF" },
          focus: "#007AB8",
        },
        layout: { radius: { small: "4px", medium: "8px", large: "12px" } },
      },
    },
  }),
],
```

## Report variables

`styles/globals.css` defines `--report-*` variables used by report components. Repoint them at the
brand tokens first, which restyles reports without touching components, then migrate usages:

```css
--report-navy: var(--la-dark-blue);
--report-ink: var(--la-dark-blue);
--report-blue: var(--la-true-blue);
--report-blue-deep: var(--la-cwru-blue);
--report-gold: var(--la-level-2);
--report-gold-pale: color-mix(in srgb, var(--la-level-2) 16%, white);
--report-canvas: var(--la-canvas);
--report-line: var(--la-line);
--report-muted: var(--la-muted);
--report-shadow: var(--la-shadow-raised);
```

Note `--report-gold` text: Orange fails as text on white, so any place it colors text must switch to
Dark Blue on an Orange tint.

## Rollout order

1. Tokens (this file) and the HeroUI mapping.
2. Shell: sidebar and page header, which every student page inherits.
3. Report and session: the most custom color and the most text to move behind disclosures.
4. Pickers and paths: replace the teal and navy one-offs.
