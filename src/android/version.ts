export const androidVersionCode = (version: string): number | null => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  const [, major, minor, patch] = match.map(Number);
  if (major > 999 || minor > 999 || patch > 999) return null;
  return major * 1_000_000 + minor * 1_000 + patch;
};
