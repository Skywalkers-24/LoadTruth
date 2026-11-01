import nextPlugin from "@next/eslint-plugin-next";

/**
 * Flat ESLint config for Next.js 16 + TypeScript. We use the Next plugin's
 * recommended + core-web-vitals rule sets directly rather than the legacy
 * FlatCompat shim, which has a circular-structure bug under ESLint 9.
 */
const eslintConfig = [
  { ignores: [".next/**", ".open-next/**", ".wrangler/**", "node_modules/**", "coverage/**"] },
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];

export default eslintConfig;
