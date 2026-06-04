const storageKey = "bindle.onboarding.localSetupComplete.v1";

const canUseStorage = () =>
  typeof window !== "undefined" && "localStorage" in window;

export const loadLocalOnboardingComplete = (): boolean => {
  if (!canUseStorage()) {
    return false;
  }

  return window.localStorage.getItem(storageKey) === "true";
};

export const saveLocalOnboardingComplete = (): void => {
  if (!canUseStorage()) {
    return;
  }

  // Storage boundary: this stores only a non-secret boolean that local wallet
  // setup completed once. It contains no addresses, passkey material, RAILGUN
  // secrets, balances, endpoints, or transaction history.
  window.localStorage.setItem(storageKey, "true");
};

export const clearLocalOnboardingComplete = (): void => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(storageKey);
};
