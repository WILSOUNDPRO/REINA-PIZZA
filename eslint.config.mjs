import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [{ ignores: [".next/**", "node_modules/**", ".tmp/**", "tests/e2e/**", "next-env.d.ts"] }, ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Texte français : les apostrophes droites sont voulues dans le JSX.
  { rules: { "react/no-unescaped-entities": "off" } }];

export default config;
