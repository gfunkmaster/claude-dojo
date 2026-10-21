import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "workspace", "results", "generated", "exercises", "web/.next", "web/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
