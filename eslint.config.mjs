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
      // Hard requirement: the `where` clause must include `tenantId` (or a
      // `tenantId_*` composite-unique key). Legitimate cross-tenant queries
      // (auth lookup, tenant picker, system-admin, internal helpers where
      // upstream verified scope) are exempted via `eslint-disable-next-line`
      // with an inline justification comment.
      "tenant/require-tenant-scope": "error",
    },
  },
]);

export default eslintConfig;
