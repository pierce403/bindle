import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const release = process.argv.includes("--release");
const buildEnvironment = { ...process.env };
if (release && process.env.BINDLE_ANDROID_PASSWORD_FILE) {
  const password = readFileSync(process.env.BINDLE_ANDROID_PASSWORD_FILE, "utf8").trim();
  if (!password) throw new Error("BINDLE_ANDROID_PASSWORD_FILE is empty.");
  buildEnvironment.BINDLE_ANDROID_STORE_PASSWORD ??= password;
  buildEnvironment.BINDLE_ANDROID_KEY_PASSWORD ??= password;
}
const requiredSigningVariables = [
  "BINDLE_ANDROID_KEYSTORE",
  "BINDLE_ANDROID_STORE_PASSWORD",
  "BINDLE_ANDROID_KEY_ALIAS",
  "BINDLE_ANDROID_KEY_PASSWORD"
];

if (release) {
  const missing = requiredSigningVariables.filter((name) => !buildEnvironment[name]);
  if (missing.length) throw new Error(`Missing Android signing variables: ${missing.join(", ")}`);
}

const run = (command, args, cwd = repoRoot, env = buildEnvironment) => {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("Run this script through pnpm.");
const runPnpm = (args) => run(process.execPath, [pnpmCli, ...args]);

runPnpm(["run", "build"]);
runPnpm(["exec", "cap", "sync", "android"]);

const javaHome = process.env.BINDLE_JAVA_HOME ??
  (existsSync("/usr/lib/jvm/java-21-openjdk-amd64/bin/javac")
    ? "/usr/lib/jvm/java-21-openjdk-amd64"
    : existsSync("/usr/lib/jvm/java-25-openjdk-amd64/bin/javac")
      ? "/usr/lib/jvm/java-25-openjdk-amd64"
      : process.env.JAVA_HOME);
const androidHome = process.env.ANDROID_HOME ??
  (existsSync("/home/pierce/Android/Sdk") ? "/home/pierce/Android/Sdk" : process.env.ANDROID_SDK_ROOT);
run("./gradlew", [release ? "assembleRelease" : "assembleDebug"], resolve(repoRoot, "android"), {
  ...buildEnvironment,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  ...(androidHome ? { ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome } : {})
});

const version = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version;
const variant = release ? "release" : "debug";
const source = resolve(repoRoot, `android/app/build/outputs/apk/${variant}/app-${variant}.apk`);
if (!existsSync(source)) throw new Error(`Android build did not produce ${source}`);
const destination = resolve(repoRoot, `dist/bindle-${version}-${variant}.apk`);
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
const bytes = readFileSync(destination);
console.log(JSON.stringify({
  apk: destination,
  bytes: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex")
}, null, 2));
