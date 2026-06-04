import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(repoRoot, "public", "railgun-artifacts");
const manifestPath = resolve(outputRoot, "manifest.json");
const treeUrl =
  "https://api.github.com/repos/Robert-MacWha/privacy-protocol-artifacts/git/trees/main?recursive=1";
const sourceRawBase =
  "https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/";

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "bindle-artifact-mirror"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: ${response.status.toString()}`);
  }

  return response.json();
};

const fileSize = async (path) => {
  try {
    const file = await stat(path);
    return file.size;
  } catch {
    return null;
  }
};

const mirrorFile = async (file) => {
  const relativePath = file.path.replace(/^artifacts\//, "");
  const destination = resolve(outputRoot, relativePath);
  const existingSize = await fileSize(destination);

  if (existingSize === file.size) {
    console.log(`unchanged ${relativePath}`);
    return;
  }

  const url = `${sourceRawBase}${relativePath}`;
  console.log(`download ${relativePath}`);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "bindle-artifact-mirror"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to download ${url}: ${response.status.toString()}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength !== file.size) {
    throw new Error(
      `Downloaded ${relativePath} with ${bytes.byteLength.toString()} bytes, expected ${file.size.toString()}`
    );
  }

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
};

const main = async () => {
  const tree = await fetchJson(treeUrl);
  const artifactFiles = tree.tree
    .filter(
      (item) =>
        item.type === "blob" &&
        item.path.startsWith("artifacts/railgun/") &&
        item.path.endsWith(".br")
    )
    .sort((left, right) => left.path.localeCompare(right.path));

  await mkdir(outputRoot, { recursive: true });

  for (const file of artifactFiles) {
    await mirrorFile(file);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceTreeSha: tree.sha,
    sourceRawBase,
    artifactBasePath: "/railgun-artifacts/",
    files: artifactFiles.map((file) => ({
      path: file.path.replace(/^artifacts\//, ""),
      size: file.size,
      sha: file.sha
    }))
  };

  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestPath}.tmp`, manifestPath);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
