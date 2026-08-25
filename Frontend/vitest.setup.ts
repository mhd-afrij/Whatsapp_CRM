import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom does not implement window.matchMedia (needed by ThemeProvider's
// prefers-color-scheme detection); provide a light mock so any component
// under ThemeProvider can render in tests.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});
