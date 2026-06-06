import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;

const listFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });

const removedRuntimePackages = [
  "@railgun-community/wallet",
  "@railgun-community/shared-models",
  "@railgun-community/waku-broadcaster-client-web",
  "level-js"
];

test("removed RAILGUN SDK packages are not direct dependencies", () => {
  const packageJson = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  }>("package.json");
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies
  };

  for (const packageName of removedRuntimePackages) {
    expect(allDependencies, packageName).not.toHaveProperty(packageName);
  }
});

test("removed RAILGUN SDK graph is absent from the lockfile", () => {
  const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

  for (const packageName of removedRuntimePackages) {
    expect(lockfile, packageName).not.toContain(packageName);
  }
});

test("Kohaku Waku relay dependency is explicit and not the Wallet SDK", () => {
  const packageJson = readJson<{
    dependencies?: Record<string, string>;
  }>("package.json");

  expect(packageJson.dependencies).toHaveProperty("@kohaku-eth/railgun-waku");
  expect(packageJson.dependencies?.["@kohaku-eth/railgun-waku"]).toBe(
    "npm:@kohaku-eth/railgun@0.0.1-alpha.12"
  );
  expect(packageJson.dependencies).toHaveProperty("@waku/sdk", "0.0.36");
});

test("source does not import removed RAILGUN SDK packages", () => {
  const files = listFiles("src").filter((path) => /\.(ts|tsx)$/.test(path));

  for (const path of files) {
    const source = readFileSync(path, "utf8");
    for (const packageName of removedRuntimePackages) {
      expect(source, `${path} imports ${packageName}`).not.toContain(
        `from "${packageName}`
      );
      expect(source, `${path} imports ${packageName}`).not.toContain(
        `import("${packageName}`
      );
    }
  }
});

test("normal app flows do not reference SDK fallback or repair language", () => {
  const migrationFiles = new Set([
    "src/railgun/railgunWallet.ts",
    "src/wallet/accountExport.ts",
    "src/wallet/walletState.ts"
  ]);
  const files = listFiles("src")
    .filter((path) => /\.(ts|tsx)$/.test(path))
    .filter((path) => !migrationFiles.has(relative(".", path)));

  for (const path of files) {
    const source = readFileSync(path, "utf8");
    expect(source, `${path} references SDK fallback`).not.toMatch(
      /Wallet SDK fallback|SDK compatibility|SDK repair|railgunWalletSdk|railgun-wallet-sdk/i
    );
  }
});
