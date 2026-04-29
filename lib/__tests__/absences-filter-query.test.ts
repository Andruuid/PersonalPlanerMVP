import { describe, expect, it } from "vitest";
import { buildAbsenceFilterSearchParams } from "@/components/admin/absences/filter-query";

describe("buildAbsenceFilterSearchParams", () => {
  it("keeps status=ALL explicitly to avoid OPEN fallback", () => {
    const params = buildAbsenceFilterSearchParams(
      new URLSearchParams("status=APPROVED&type=VACATION"),
      "status",
      "ALL",
    );

    expect(params.get("status")).toBe("ALL");
    expect(params.get("type")).toBe("VACATION");
  });

  it("removes non-status filters when selecting ALL", () => {
    const params = buildAbsenceFilterSearchParams(
      new URLSearchParams("status=APPROVED&type=VACATION&employee=abc"),
      "type",
      "ALL",
    );

    expect(params.get("status")).toBe("APPROVED");
    expect(params.get("type")).toBeNull();
    expect(params.get("employee")).toBe("abc");
  });
});
