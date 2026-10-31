import { heroui } from "@heroui/theme";

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      // Leadership Avatar brand tokens (mirrors --la-* in styles/globals.css).
      // Hex rather than var() so opacity modifiers like bg-light-blue/30 work.
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
        weatherhead: {
          primary: "#003071",
          white: "#FFFFFF",
          softGray: "#F5F8FB",
          textGray: "rgb(9 20 58 / 0.68)",
          badgeGreen: "#377E72",
        },
      },
      boxShadow: {
        raised: "0 12px 32px rgb(9 20 58 / 0.16)",
      },
      spacing: {
        touch: "44px", // Minimum touch target size
      },
      backgroundImage: {
        "avatar-gradient":
          "linear-gradient(to bottom right, #003071, #007AB8)",
      },
    },
  },
  plugins: [
    heroui({
      defaultTheme: "light",
      themes: {
        light: {
          colors: {
            background: "#F5F8FB",
            foreground: "#09143A",
            divider: "rgba(9, 20, 58, 0.14)",
            focus: "#007AB8",
            primary: { DEFAULT: "#003071", foreground: "#FFFFFF" },
            secondary: { DEFAULT: "#007AB8", foreground: "#FFFFFF" },
            success: { DEFAULT: "#377E72", foreground: "#FFFFFF" },
            warning: { DEFAULT: "#FF9239", foreground: "#09143A" },
            danger: { DEFAULT: "#D63D1F", foreground: "#FFFFFF" },
          },
          layout: {
            radius: { small: "4px", medium: "8px", large: "12px" },
          },
        },
      },
    }),
  ],
};

module.exports = config;
