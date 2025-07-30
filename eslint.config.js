import globals from "globals";
import eslint from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import path from "path";
import { fileURLToPath } from "url";
import tsParser from "@typescript-eslint/parser"; // Directly import the parser

// Mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  // ESLint's own recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint recommended rules (converted using FlatCompat)
  ...compat.extends("plugin:@typescript-eslint/recommended"),

  // React Hooks recommended rules (converted using FlatCompat)
  ...compat.extends("plugin:react-hooks/recommended"),

  // JSX A11y recommended rules (converted using FlatCompat)
  ...compat.extends("plugin:jsx-a11y/recommended"),

  // Project-specific configurations and overrides
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser, // Correctly use the imported tsParser
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        browser: "readonly",
        defineBackground: "readonly",
        defineContentScript: "readonly",
        I18n: "readonly",
        URL: "readonly",
        Location: "readonly",
        MutationObserver: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        CustomEvent: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        requestIdleCallback: "readonly",
        cancelIdleCallback: "readonly",
        AbortController: "readonly",
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
      react: {
        version: "detect",
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-constant-condition": "warn",
      "no-console": "off",

      // TypeScript ESLint rules (these will be applied after being extended by compat)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/explicit-function-return-type": "off",

      // React Hooks rules (these will be applied after being extended by compat)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // JSX A11y rules (these will be applied after being extended by compat)
      "jsx-a11y/alt-text": [
        "warn",
        {
          elements: ["img", "object", "area", 'input[type="image"]'],
          img: ["Image"],
        },
      ],
      "jsx-a11y/anchor-is-valid": [
        "warn",
        {
          components: ["Link"],
          specialLink: ["hrefLeft", "hrefRight"],
          aspects: ["invalidHref", "preferButton"],
        },
      ],
    },
    // Define global variables for Vitest
    globals: {
      describe: "readonly",
      test: "readonly",
      it: "readonly",
      expect: "readonly",
      beforeAll: "readonly",
      beforeEach: "readonly",
      afterAll: "readonly",
      afterEach: "readonly",
      vi: "readonly",
      vitest: "readonly",
    },
  },

  // Ignore generated files and directories from linting
  {
    ignores: ["**/.output/**", "**/.wxt/**", "node_modules/**"],
    linterOptions: {
      noWarnIgnored: true,
    },
  },
];
