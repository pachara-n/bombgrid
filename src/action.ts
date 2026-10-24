// GitHub Action entry point (bundled into dist/index.js).
import * as core from "@actions/core";
import { fetchGrid } from "./fetch/index.ts";
import { describePlan, generateAll } from "./generate.ts";
import { parseOutputs } from "./options.ts";
import { writeOutputs } from "./write.ts";

async function run() {
  const user = core.getInput("github_user_name", { required: true });
  const token = core.getInput("github_token");
  if (token) core.setSecret(token);
  const specs = parseOutputs(core.getInput("outputs", { required: true }));

  const { weeks, levels, source } = await fetchGrid({ user, token, warn: core.warning });
  core.info(`Contribution data source: ${source}`);

  const results = generateAll(weeks, specs, levels);
  results.forEach((r, i) => core.info(`#${i + 1} ${r.spec.path}: ${describePlan(r.plan)}`));
  const written = writeOutputs(results);
  written.forEach((p, i) => core.info(`wrote ${p} (${(results[i].svg.length / 1024).toFixed(0)} KB)`));
  core.setOutput("files", written.join("\n"));
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
