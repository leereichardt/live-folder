import autoImports from "./.wxt/eslint-auto-imports.mjs";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import eslint from "@eslint/js";
import tseslintParser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config} */
export default tseslint.config(
  autoImports,
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,ts,jsx,tsx}"],
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
    },
  },
);
