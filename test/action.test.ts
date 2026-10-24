// Runs the bundled action (dist/index.js) the way the Actions runner does: inputs come from
// INPUT_* environment variables. Only offline paths are tested here (input validation).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("the bundle fails with a clear error for a bad `outputs` input", () => {
  const build = spawnSync(process.execPath, ["scripts/build.mjs"], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);

  const run = spawnSync(process.execPath, ["dist/index.js"], {
    encoding: "utf8",
    env: { ...process.env, INPUT_GITHUB_USER_NAME: "octo", INPUT_OUTPUTS: "x.svg?palette=neon" },
  });
  assert.equal(run.status, 1);
  // the runner turns ::error:: lines into annotations on the workflow run
  assert.match(run.stdout, /::error::Unknown palette "neon"/);
});

test("the bundle asks for the user name when it is missing", () => {
  const run = spawnSync(process.execPath, ["dist/index.js"], {
    encoding: "utf8",
    env: { ...process.env, INPUT_GITHUB_USER_NAME: "", INPUT_OUTPUTS: "x.svg" },
  });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /github_user_name/);
});
