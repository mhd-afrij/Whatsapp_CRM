import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

const eslintConfig = tseslint.config(
  globalIgnores(["dist", "node_modules", "build"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactRefresh.configs.vite],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs["recommended-latest"].rules,
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
);

export default eslintConfig;
