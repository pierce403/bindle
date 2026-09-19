import { bindleBuildInfo } from "../buildInfo";

const formatBuildTime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
};

export function BuildMetadataLink({ onOpenVersion }: { onOpenVersion?: () => void }) {
  const buildTime = formatBuildTime(bindleBuildInfo.time);

  if (onOpenVersion) return (
    <button className="build-metadata-link" type="button" onClick={onOpenVersion}
      title="Open version and update settings">
      v{bindleBuildInfo.version} · {bindleBuildInfo.shortCommit}
    </button>
  );

  return (
    <a
      className="build-metadata-link"
      href={bindleBuildInfo.commitUrl}
      rel="noreferrer"
      target="_blank"
      title={`Build ${bindleBuildInfo.commit} at ${bindleBuildInfo.time}`}
    >
      v{bindleBuildInfo.version} · {bindleBuildInfo.shortCommit} · {buildTime}
    </a>
  );
}
