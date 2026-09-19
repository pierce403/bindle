import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const listFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry);
  return statSync(path).isDirectory() ? listFiles(path) : [path];
});
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  pnpm: { overrides: Record<string, string>; patchedDependencies: Record<string, string> };
};

test("one Kohaku generation owns wallet and proof functionality", () => {
  expect(packageJson.dependencies["@kohaku-eth/railgun"]).toBe("0.0.1-alpha.30");
  expect(packageJson.dependencies).not.toHaveProperty("@kohaku-eth/railgun-waku");
  expect(packageJson.dependencies).not.toHaveProperty("@waku/sdk");
  const lockfile = readFileSync("pnpm-lock.yaml", "utf8");
  expect(lockfile).not.toContain("@kohaku-eth/railgun@0.0.1-alpha.12");
  expect(lockfile).not.toContain("@kohaku-eth/railgun@0.0.1-alpha.22");
});

test("official browser transport is pinned with auditable policy patches", () => {
  expect(packageJson.dependencies["@railgun-community/waku-broadcaster-client-web"]).toBe("9.1.1");
  expect(packageJson.dependencies["@railgun-community/shared-models"]).toBe("8.0.1");
  expect(packageJson.dependencies["@railgun-community/wallet"]).toBe("10.9.1");
  for (const [name, path] of Object.entries(packageJson.pnpm.patchedDependencies)) {
    expect(name).toMatch(/^@(?:railgun-community\/waku-broadcaster-client-web|waku\/discovery|libp2p\/peer-store)@/);
    expect(readFileSync(path, "utf8")).toContain("--- a/dist/");
  }
  expect(Object.keys(packageJson.pnpm.patchedDependencies)).toHaveLength(3);
});

test("the app never starts a second RAILGUN wallet engine or imports the old alias", () => {
  for (const path of listFiles("src").filter((path) => /\.(ts|tsx)$/.test(path))) {
    const source = readFileSync(path, "utf8");
    expect(source, path).not.toMatch(/startRailgunEngine|loadWalletByID|@kohaku-eth\/railgun-waku/);
    expect(source, path).not.toMatch(/(?:from\s*|import\()["']@railgun-community\/wallet/);
  }
});

test("browser compatibility uses only the exact shims proven necessary", () => {
  expect(packageJson.dependencies).toMatchObject({ buffer: "6.0.3", process: "0.11.10", "stream-browserify": "3.0.0" });
  expect(packageJson.devDependencies).not.toHaveProperty("vite-plugin-node-polyfills");
  // The official wallet helper dependency retains these Node-only transitive
  // packages in the lockfile; Vite's build guard rejects them in rendered chunks.
  expect(packageJson.dependencies).not.toHaveProperty("crypto-browserify");
  expect(packageJson.dependencies).not.toHaveProperty("elliptic");
  const config = readFileSync("vite.config.ts", "utf8");
  expect(config).toContain("crypto-browserify");
  expect(config).toContain("elliptic");
});

test("existing patched transitive packages remain pinned", () => {
  expect(packageJson.pnpm.overrides).toMatchObject({
    underscore: "1.13.8", uuid: "11.1.1", ws: "8.21.3", axios: "1.20.0",
    qs: "6.16.0", "bn.js@<5": "4.12.5", postcss: "8.5.28", "form-data@<3": "2.5.6"
  });
  const lockfile = readFileSync("pnpm-lock.yaml", "utf8");
  for (const vulnerable of ["underscore@1.13.6", "uuid@9.0.1", "ws@8.17.1", "ws@8.18.3", "ws@8.20.1", "axios@1.7.2", "bn.js@4.11.6", "qs@6.5.5", "form-data@2.3.3", "postcss@8.5.15"]) {
    expect(lockfile, vulnerable).not.toContain(vulnerable);
  }
});
