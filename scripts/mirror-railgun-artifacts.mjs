import { mkdir, readFile, rename, stat, writeFile, unlink, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

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

const sha256Hash = (bytes) => {
  return createHash("sha256").update(bytes).digest("hex");
};

const loadExistingManifest = async () => {
  try {
    const content = await readFile(manifestPath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
};

const deleteOldBrFiles = async (dir) => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await deleteOldBrFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".br")) {
        console.log(`Deleting old transcoded br file: ${fullPath}`);
        await unlink(fullPath);
      }
    }
  } catch (err) {
    // Directory might not exist yet, which is fine
  }
};

const mirrorFile = async (file, existingManifest, force) => {
  const relativePath = file.path.replace(/^artifacts\//, "");
  const localRelPath = `${relativePath}.bin`;
  const destination = resolve(outputRoot, localRelPath);

  // Check if we can reuse the existing file
  if (!force) {
    try {
      const existingBytes = await readFile(destination);
      const computedSha = sha256Hash(existingBytes);
      const manifestEntry = existingManifest?.files?.find((f) => f.path === relativePath);
      if (
        existingBytes.byteLength === file.size &&
        manifestEntry &&
        manifestEntry.sha256 === computedSha
      ) {
        console.log(`already mirrored (verified SHA256): ${localRelPath}`);
        file.sha256 = computedSha;
        return;
      }
    } catch {
      // File does not exist or cannot be read, which is fine
    }
  }

  const url = `${sourceRawBase}${relativePath}`;
  console.log(`downloading exact bytes for ${relativePath}`);
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

  const computedSha = sha256Hash(bytes);
  file.sha256 = computedSha;

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  console.log(`successfully mirrored: ${localRelPath}`);
};

const main = async () => {
  const force = process.argv.includes("--force") || process.argv.includes("-f");

  await deleteOldBrFiles(outputRoot);

  const existingManifest = await loadExistingManifest();

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
    await mirrorFile(file, existingManifest, force);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceTreeSha: tree.sha,
    sourceRawBase,
    artifactBasePath: "/railgun-artifacts/",
    files: artifactFiles.map((file) => {
      const relativePath = file.path.replace(/^artifacts\//, "");
      const localRelPath = `${relativePath}.bin`;
      const localPath = `/railgun-artifacts/${localRelPath}`;
      return {
        path: relativePath,
        sourceSize: file.size,
        sourceGitBlobSha: file.sha,
        localPath,
        localSize: file.size,
        sha256: file.sha256
      };
    })
  };

  await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(`${manifestPath}.tmp`, manifestPath);
  console.log("Manifest generated successfully.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
