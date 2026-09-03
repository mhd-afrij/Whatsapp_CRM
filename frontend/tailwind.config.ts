import type { Config } from "tailwindcss";

// Tailwind v4 primarily reads theme tokens from the `@theme` block in
// src/app/globals.css. This file mirrors those same CSS-variable-backed
// colors for tooling that still inspects tailwind.config (editors, plugins,
// storybook, etc).
const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          dark: "var(--color-primary-dark)",
          soft: "var(--color-primary-soft)",
        },
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        text: "var(--color-text)",
        muted: "var(--color-muted)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
        info: "var(--color-info)",
      },
    },
  },
  plugins: [],
};

export default config;
