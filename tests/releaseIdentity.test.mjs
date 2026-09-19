import assert from "node:assert/strict";
import test from "node:test";
import { assertFreshReleaseId } from "../scripts/release-identity.mjs";

const release = (id, commit = id) => ({
  version: "0.2.1",
  commit,
  time: "2026-09-19T00:00:00Z",
  id
});

test("a new release ID is accepted", () => {
  assert.doesNotThrow(() => assertFreshReleaseId(release("old"), release("new")));
});

test("a build is accepted when no release has been published", () => {
  assert.doesNotThrow(() => assertFreshReleaseId(undefined, release("new")));
});

test("a published release ID cannot be rebuilt exactly", () => {
  assert.throws(
    () => assertFreshReleaseId(release("same"), release("same")),
    /Refusing to rebuild published PWA release ID same/
  );
});

test("conflicting metadata cannot be emitted under a published release ID", () => {
  assert.throws(
    () => assertFreshReleaseId(release("same", "old-commit"), release("same", "new-commit")),
    /Refusing to rebuild published PWA release ID same/
  );
});
