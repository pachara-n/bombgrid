// Bundles the GitHub Action into a single file, dist/index.js, using esbuild.
// GitHub runs that file directly (no npm install), so it must be committed to git.
import { build } from "esbuild";

await build({
  entryPoints: ["src/action.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // some CommonJS dependencies (@actions/core) call require(); give the ESM bundle a working one
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: "none",
  logLevel: "info",
});
