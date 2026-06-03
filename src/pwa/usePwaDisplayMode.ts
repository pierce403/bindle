import { useEffect, useState } from "react";
import { isRunningAsPwa } from "./installPrompt";

const displayModeQueries = [
  "(display-mode: standalone)",
  "(display-mode: fullscreen)",
  "(display-mode: minimal-ui)"
];

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

export const usePwaDisplayMode = () => {
  const [runningAsPwa, setRunningAsPwa] = useState(() => isRunningAsPwa());

  useEffect(() => {
    const updateDisplayMode = () => setRunningAsPwa(isRunningAsPwa());
    const mediaQueries = displayModeQueries.map((query) =>
      window.matchMedia(query)
    );

    mediaQueries.forEach((mediaQuery) => {
      if ("addEventListener" in mediaQuery) {
        mediaQuery.addEventListener("change", updateDisplayMode);
        return;
      }

      (mediaQuery as LegacyMediaQueryList).addListener?.(updateDisplayMode);
    });
    window.addEventListener("appinstalled", updateDisplayMode);

    return () => {
      mediaQueries.forEach((mediaQuery) => {
        if ("removeEventListener" in mediaQuery) {
          mediaQuery.removeEventListener("change", updateDisplayMode);
          return;
        }

        (mediaQuery as LegacyMediaQueryList).removeListener?.(updateDisplayMode);
      });
      window.removeEventListener("appinstalled", updateDisplayMode);
    };
  }, []);

  return runningAsPwa;
};
