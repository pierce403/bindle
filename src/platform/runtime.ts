import { Capacitor } from "@capacitor/core";

export const isAndroidApp = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
