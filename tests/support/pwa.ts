import type { Page } from "@playwright/test";

export const enableStandalonePwa = async (page: Page) => {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string): MediaQueryList => {
        if (!query.startsWith("(display-mode:")) {
          return originalMatchMedia(query);
        }

        const matches = query === "(display-mode: standalone)";

        return {
          media: query,
          matches,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false
        } as MediaQueryList;
      }
    });
  });
};
