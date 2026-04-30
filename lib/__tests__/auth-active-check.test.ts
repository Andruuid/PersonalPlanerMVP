import { describe, expect, it } from "vitest";
import { Role } from "@/lib/generated/prisma/enums";
import {
  isCredentialsLoginAllowed,
  type CredentialsLoginUserForActiveCheck,
} from "@/lib/auth-credentials-login";

function baseEmployee(): NonNullable<
  CredentialsLoginUserForActiveCheck["employee"]
> {
  return {
    id: "emp_1",
    status: "AKTIV",
  };
}

describe("isCredentialsLoginAllowed", () => {
  it("denies inactive user regardless of role", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: false,
        role: Role.ADMIN,
        employee: null,
      }),
    ).toBe(false);
    expect(
      isCredentialsLoginAllowed({
        isActive: false,
        role: Role.EMPLOYEE,
        employee: baseEmployee(),
      }),
    ).toBe(false);
  });

  it("allows ADMIN without linked employee", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: true,
        role: Role.ADMIN,
        employee: null,
      }),
    ).toBe(true);
  });

  it("allows ADMIN with inactive employee row (drift)", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: true,
        role: Role.ADMIN,
        employee: { ...baseEmployee(), status: "INAKTIV" },
      }),
    ).toBe(true);
  });

  it("denies EMPLOYEE without employee profile", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: true,
        role: Role.EMPLOYEE,
        employee: null,
      }),
    ).toBe(false);
  });

  it("denies EMPLOYEE when employee is inactive", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: true,
        role: Role.EMPLOYEE,
        employee: { ...baseEmployee(), status: "INAKTIV" },
      }),
    ).toBe(false);
  });

  it("denies EMPLOYEE when employee is archived", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: true,
        role: Role.EMPLOYEE,
        employee: { ...baseEmployee(), status: "ARCHIVIERT" },
      }),
    ).toBe(false);
  });

  it("allows EMPLOYEE with active non-deleted employee", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: true,
        role: Role.EMPLOYEE,
        employee: baseEmployee(),
      }),
    ).toBe(true);
  });
});
