export const assertFreshReleaseId = (previousBuild, nextBuild) => {
  if (!previousBuild || previousBuild.id !== nextBuild.id) {
    return;
  }

  throw new Error(
    `Refusing to rebuild published PWA release ID ${nextBuild.id}. ` +
    "Release IDs are immutable because the installed update controller treats an approved ID as already staged. " +
    "Use a new source commit or build timestamp so the release receives a new ID."
  );
};
