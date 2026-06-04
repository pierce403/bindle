import {
  parseBindleOwnerEnrollmentCode,
  type BindleOwnerEnrollmentCode
} from "./passkeys";

export type PendingOwnerEnrollment = {
  code: string;
  enrollment: BindleOwnerEnrollmentCode;
};

const storageKey = "bindle.pending-owner-enrollment.v1";

const canUseStorage = () => typeof window !== "undefined" && "localStorage" in window;

export const loadPendingOwnerEnrollment = (): PendingOwnerEnrollment | null => {
  if (!canUseStorage()) {
    return null;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "code" in parsed &&
      typeof parsed.code === "string"
    ) {
      return {
        code: parsed.code,
        enrollment: parseBindleOwnerEnrollmentCode(parsed.code)
      };
    }
  } catch {
    window.localStorage.removeItem(storageKey);
  }

  return null;
};

export const savePendingOwnerEnrollment = (
  pending: PendingOwnerEnrollment
): PendingOwnerEnrollment => {
  if (canUseStorage()) {
    // Storage boundary: this record contains public passkey owner metadata only.
    // WebAuthn private key material remains inside the browser authenticator or
    // hardware key and is never exposed to JavaScript.
    window.localStorage.setItem(storageKey, JSON.stringify({ code: pending.code }));
  }

  return pending;
};

export const clearPendingOwnerEnrollment = () => {
  if (canUseStorage()) {
    window.localStorage.removeItem(storageKey);
  }
};
