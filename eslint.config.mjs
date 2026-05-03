import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import {
  requirePrismaWhereRule,
  requireTenantScopeRule,
} from "./eslint/rules/require-prisma-where.js";

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
          "require-tenant-scope": requireTenantScopeRule,
        },
      },
    },
    rules: {
      // Hard requirement: every Prisma read/write must pass a `where` clause.
      "tenant/require-prisma-where": "error",
      // Stronger requirement: the `where` clause must include `tenantId` (or
      // a `tenantId_*` composite-unique key). Currently `warn` because there
      // is a backlog of legacy call sites; flip to `error` once H5 lands.
      "tenant/require-tenant-scope": "warn",
    },
  },
]);

export default eslintConfig;
