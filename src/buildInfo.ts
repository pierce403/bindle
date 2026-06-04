declare const __BINDLE_BUILD_COMMIT__: string;
declare const __BINDLE_BUILD_TIME__: string;

const unknownCommit = "unknown";
const commitPattern = /^[0-9a-f]{7,40}$/i;

const buildCommit =
  typeof __BINDLE_BUILD_COMMIT__ === "string" &&
  __BINDLE_BUILD_COMMIT__.trim()
    ? __BINDLE_BUILD_COMMIT__.trim()
    : unknownCommit;

const buildTime =
  typeof __BINDLE_BUILD_TIME__ === "string" && __BINDLE_BUILD_TIME__.trim()
    ? __BINDLE_BUILD_TIME__.trim()
    : "unknown";

export const bindleBuildInfo = {
  commit: buildCommit,
  shortCommit:
    buildCommit === unknownCommit ? unknownCommit : buildCommit.slice(0, 12),
  time: buildTime,
  commitUrl: commitPattern.test(buildCommit)
    ? `https://github.com/pierce403/bindle/commit/${buildCommit}`
    : "https://github.com/pierce403/bindle"
};

