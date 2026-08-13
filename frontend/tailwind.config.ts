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
        success: {
          DEFAULT: "var(--color-success)",
          light: "var(--color-success-light)",
          dark: "var(--color-success-dark)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          light: "var(--color-warning-light)",
          dark: "var(--color-warning-dark)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          light: "var(--color-danger-light)",
          dark: "var(--color-danger-dark)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          light: "var(--color-info-light)",
          dark: "var(--color-info-dark)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
