import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("public/android-service-worker.js", "utf8");

test("Android worker cannot stage or approve application releases", () => {
  assert.doesNotMatch(source, /release\.json/);
  assert.doesNotMatch(source, /bindle-shell-/);
  assert.doesNotMatch(source, /BINDLE_(?:APPROVE|CHECK_FOR)_UPDATE/);
  assert.doesNotMatch(source, /request\.mode\s*===\s*["']navigate["']/);
});

test("Android worker retains only the bundled artifact proxy surface", () => {
  assert.match(source, /BINDLE_ARTIFACT_PROXY_READY/);
  assert.match(source, /\/railgun-artifacts\//);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source, /request\.method\s*!==\s*["']GET["']/);
});
