import {
  rawBuildCommit,
  rawBuildTime
} from "virtual:bindle-build-info";

const unknownCommit = "unknown";
const commitPattern = /^[0-9a-f]{7,40}$/i;

const buildCommit =
  typeof rawBuildCommit === "string" && rawBuildCommit.trim()
    ? rawBuildCommit.trim()
    : unknownCommit;

const buildTime =
  typeof rawBuildTime === "string" && rawBuildTime.trim()
    ? rawBuildTime.trim()
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
