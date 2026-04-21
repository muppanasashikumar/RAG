import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom lacks matchMedia — tests for useTheme rely on it.
if (typeof window !== "undefined" && !window.matchMedia) {
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
}

// Silence Base UI's use of IntersectionObserver / ResizeObserver if they come up.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

if (typeof window !== "undefined") {
  // @ts-expect-error polyfill for jsdom
  window.ResizeObserver = window.ResizeObserver ?? NoopObserver;
  // @ts-expect-error polyfill for jsdom
  window.IntersectionObserver = window.IntersectionObserver ?? NoopObserver;
}
