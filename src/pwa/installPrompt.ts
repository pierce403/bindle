export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export const isRunningAsPwa = () => {
  const standaloneMedia = window.matchMedia("(display-mode: standalone)");
  const fullscreenMedia = window.matchMedia("(display-mode: fullscreen)");
  const minimalUiMedia = window.matchMedia("(display-mode: minimal-ui)");
  const navigatorStandalone =
    "standalone" in navigator &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return (
    standaloneMedia.matches ||
    fullscreenMedia.matches ||
    minimalUiMedia.matches ||
    navigatorStandalone
  );
};
