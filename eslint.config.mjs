import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  {
    rules: {
      "react/no-danger": "error",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "design_handoff_khatib_platform/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
