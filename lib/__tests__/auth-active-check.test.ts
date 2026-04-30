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
    isActive: true,
    deletedAt: null,
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
        employee: { ...baseEmployee(), isActive: false },
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
        employee: { ...baseEmployee(), isActive: false },
      }),
    ).toBe(false);
  });

  it("denies EMPLOYEE when employee is soft-deleted", () => {
    expect(
      isCredentialsLoginAllowed({
        isActive: true,
        role: Role.EMPLOYEE,
        employee: { ...baseEmployee(), deletedAt: new Date("2026-01-01") },
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
