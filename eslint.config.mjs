import tseslint from "typescript-eslint";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export default tseslint.config(
  // ── Ignore patterns ──
  {
    ignores: [
      "node_modules/",
      "dist/",
      ".expo/",
      "android/",
      "ios/",
      "babel.config.js",
      "metro.config.js",
      "jest.config.js",
      "tailwind.config.ts",
    ],
  },

  // ── Base: recommended TypeScript rules ──
  ...tseslint.configs.recommended,

  // ── Custom rules ──
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      // ─── Biến & Tham số ───
      "no-var": "error",
      "prefer-const": "warn",
      "no-unused-expressions": "warn",

      // ─── TypeScript ───
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // ─── Import sort ───
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",

      // ─── Clean code ───
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-return-await": "warn",
      "no-throw-literal": "error",
      "no-nested-ternary": "warn",
    },
  }
);
