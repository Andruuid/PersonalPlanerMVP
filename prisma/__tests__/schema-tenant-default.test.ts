import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA_PATH = join(process.cwd(), "prisma", "schema.prisma");

describe("prisma/schema.prisma — tenantId safety", () => {
  it("does not use the dangerous tenantId @default(\"default\") footgun", () => {
    const raw = readFileSync(SCHEMA_PATH, "utf8");
    expect(raw).not.toContain('@default("default")');
  });
});
