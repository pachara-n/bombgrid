import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // dist/ is generated, fixtures are data
  { ignores: ["dist/", "out/", "node_modules/", "fixtures/", "assets/", "reference/", "samples/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // the planner uses a few intentionally unused tuple slots
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
