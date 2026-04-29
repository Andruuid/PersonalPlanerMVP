export const requirePrismaWhereRule = {
  meta: {
    type: "problem",
    docs: {
      description: "require Prisma findMany/findFirst calls to include a where clause",
    },
    schema: [],
    messages: {
      missingWhere:
        "Prisma {{method}} must include a tenant-scoped `where` clause.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        const method =
          callee.property.type === "Identifier" ? callee.property.name : null;
        if (method !== "findMany" && method !== "findFirst") return;

        const modelAccess = callee.object;
        if (modelAccess.type !== "MemberExpression" || modelAccess.computed) return;
        if (
          modelAccess.object.type !== "Identifier" ||
          !["prisma", "tx"].includes(modelAccess.object.name)
        ) {
          return;
        }

        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== "ObjectExpression") {
          context.report({ node, messageId: "missingWhere", data: { method } });
          return;
        }
        const hasWhere = firstArg.properties.some(
          (prop) =>
            prop.type === "Property" &&
            !prop.computed &&
            ((prop.key.type === "Identifier" && prop.key.name === "where") ||
              (prop.key.type === "Literal" && prop.key.value === "where")),
        );
        if (!hasWhere) {
          context.report({ node, messageId: "missingWhere", data: { method } });
        }
      },
    };
  },
};
