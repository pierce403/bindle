import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(repoRoot, "public", "railgun-artifacts");
const manifestPath = resolve(outputRoot, "manifest.json");

const sha256Hash = (bytes) => {
  return createHash("sha256").update(bytes).digest("hex");
};

const main = async () => {
  if (!existsSync(manifestPath)) {
    console.error("Manifest not found! Run mirroring first.");
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  console.log(`Verifying ${manifest.files.length} artifacts...`);

  for (const file of manifest.files) {
    const filePath = resolve(repoRoot, "public", file.localPath.replace(/^\//, ""));
    console.log(`Verifying ${file.path}...`);

    if (!existsSync(filePath)) {
      console.error(`File does not exist: ${filePath}`);
      process.exit(1);
    }

    const bytes = await readFile(filePath);

    // Verify size
    if (bytes.byteLength !== file.localSize) {
      console.error(
        `Size mismatch for ${file.path}: got ${bytes.byteLength.toString()}, expected ${file.localSize.toString()}`
      );
      process.exit(1);
    }

    // Verify SHA256
    const hash = sha256Hash(bytes);
    if (hash !== file.sha256) {
      console.error(`SHA256 mismatch for ${file.path}: got ${hash}, expected ${file.sha256}`);
      process.exit(1);
    }

    // Verify not gzip-transcoded (gzip starts with 1f 8b)
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      console.error(`Error: File ${file.path} is gzip-transcoded (starts with gzip signature)!`);
      process.exit(1);
    }

    // Verify Brotli decompression
    try {
      brotliDecompressSync(bytes);
    } catch (err) {
      console.error(`Brotli decompression failed for ${file.path}:`, err.message);
      process.exit(1);
    }
  }

  console.log(
    "All artifacts verified successfully! (Valid Brotli compressed, no GZIP transcoding)"
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
