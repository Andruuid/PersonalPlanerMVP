/**
 * Two related ESLint rules for tenant-scoped Prisma access.
 *
 *   tenant/require-prisma-where  — error
 *     Every tenant-scopable Prisma call must pass an object with a `where`
 *     key. Catches accidental `findMany()` / `count()` / `deleteMany()` etc.
 *     that operate on every row in the database.
 *
 *   tenant/require-tenant-scope  — warn (until H5 lands; flip to error after)
 *     The `where` clause must mention `tenantId` (or a `tenantId_*` composite
 *     unique key, or spread another where). Catches the dominant cross-tenant
 *     leak class: `findUnique({ where: { id }})` followed by a post-fetch
 *     tenant check, or any `update({ where: { id }, data })` without scope.
 *
 * Scope of both rules:
 *   - Receivers: `prisma.X.method(...)` and `tx.X.method(...)` (transactions).
 *   - Methods:   findFirst, findFirstOrThrow, findMany, findUnique,
 *                findUniqueOrThrow, update, updateMany, delete, deleteMany,
 *                upsert, count, aggregate, groupBy.
 *   - `create` / `createMany` are NOT covered — they have `data`, not `where`.
 *
 * What's accepted as tenant-scoping in `require-tenant-scope`:
 *   - Property literally named `tenantId`.
 *   - Property whose name starts with `tenantId_` (Prisma compound-unique
 *     keys like `tenantId_id`, `tenantId_employeeId_year`).
 *   - A SpreadElement `...someWhere` (can't statically prove; assume scoped).
 *
 * Known limitations (intentional, to keep rules actionable):
 *   - Queries on tenantless models (e.g. `prisma.tenant.findMany`) trigger
 *     false positives. Disable per-line:
 *     `// eslint-disable-next-line tenant/require-tenant-scope`.
 *   - Nested logical operators (`AND` / `OR` / `NOT`) are not deep-scanned.
 *   - Where clauses passed by reference (a variable) are not validated —
 *     assumed scoped. Refactor risk; eyes on review.
 */

const TENANT_SCOPED_METHODS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
  "count",
  "aggregate",
  "groupBy",
]);

const RECEIVER_NAMES = new Set(["prisma", "tx"]);

function isPrismaModelMethodCall(node) {
  const callee = node.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  const method =
    callee.property.type === "Identifier" ? callee.property.name : null;
  if (!method || !TENANT_SCOPED_METHODS.has(method)) return null;

  const modelAccess = callee.object;
  if (modelAccess.type !== "MemberExpression" || modelAccess.computed) {
    return null;
  }
  if (
    modelAccess.object.type !== "Identifier" ||
    !RECEIVER_NAMES.has(modelAccess.object.name)
  ) {
    return null;
  }
  return method;
}

function getPropertyKeyName(prop) {
  if (prop.type !== "Property" || prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal") return String(prop.key.value);
  return null;
}

function whereProperty(objectExpr) {
  for (const prop of objectExpr.properties) {
    const name = getPropertyKeyName(prop);
    if (name === "where") return prop;
  }
  return null;
}

function whereContainsTenantScope(whereValue) {
  // Non-literal where (variable reference, computed, etc.) — can't validate
  // statically; assume scoped to avoid false positives.
  if (whereValue.type !== "ObjectExpression") return true;
  for (const prop of whereValue.properties) {
    if (prop.type === "SpreadElement") return true;
    const name = getPropertyKeyName(prop);
    if (!name) continue;
    if (name === "tenantId") return true;
    if (name.startsWith("tenantId_")) return true;
  }
  return false;
}

export const requirePrismaWhereRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require Prisma read/write calls to pass an object with a `where` key",
    },
    schema: [],
    messages: {
      missingWhere:
        "Prisma {{method}} must include a `where` clause — bare calls operate on every row.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const method = isPrismaModelMethodCall(node);
        if (!method) return;

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== "ObjectExpression") {
          context.report({ node, messageId: "missingWhere", data: { method } });
          return;
        }
        if (!whereProperty(firstArg)) {
          context.report({ node, messageId: "missingWhere", data: { method } });
        }
      },
    };
  },
};

export const requireTenantScopeRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "require Prisma `where` clauses to be tenant-scoped (include `tenantId` or a `tenantId_*` composite unique)",
    },
    schema: [],
    messages: {
      missingTenantScope:
        "Prisma {{method}} `where` is not tenant-scoped — add `tenantId` (or a `tenantId_*` composite-unique key, or spread a where built with one).",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const method = isPrismaModelMethodCall(node);
        if (!method) return;

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== "ObjectExpression") return;

        const where = whereProperty(firstArg);
        if (!where) return;

        if (!whereContainsTenantScope(where.value)) {
          context.report({
            node: where,
            messageId: "missingTenantScope",
            data: { method },
          });
        }
      },
    };
  },
};
