import eslintjs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  eslintjs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    ignores: ["**/node_modules/**", "**/dist/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      }
    },
    rules: {
      // Basic Code Quality (fixable)
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_", 
        "varsIgnorePattern": "^_" 
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      
      // Formatovanie (fixable)
      "semi": ["error", "always"],
      "quotes": ["error", "single", { "avoidEscape": true }],
      "indent": ["error", 2],
      "comma-dangle": ["error", "only-multiline"],
      "eol-last": ["error", "always"],
      "no-trailing-spaces": "error",
      
      // Whitespace (fixable)
      "keyword-spacing": "error",
      "space-before-blocks": "error",
      "space-before-function-paren": ["error", {
        "anonymous": "always",
        "named": "never",
        "asyncArrow": "always"
      }],
      "space-in-parens": ["error", "never"],
      "array-bracket-spacing": ["error", "never"],
      "object-curly-spacing": ["error", "always"],
      
      // Hono kompatibilita
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          "checksVoidReturn": false
        }
      ],
      
      // Bezpečnostné pravidlá
      "@typescript-eslint/no-non-null-assertion": "error"
    }
  }
];