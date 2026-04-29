import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import { requirePrismaWhereRule } from "./eslint/rules/require-prisma-where.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "lib/generated/**",
  ]),
  {
    files: ["server/**/*.ts", "lib/**/*.ts", "app/**/*.tsx", "app/**/*.ts"],
    plugins: {
      tenant: {
        rules: {
          "require-prisma-where": requirePrismaWhereRule,
        },
      },
    },
    rules: {
      "tenant/require-prisma-where": "error",
    },
  },
]);

export default eslintConfig;
