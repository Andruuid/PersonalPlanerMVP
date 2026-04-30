/**
 * Minimal seed helpers for integration tests. Every fixture creates exactly
 * one row and returns its id, so tests can compose realistic graphs without
 * dragging in production seed data.
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { parseIsoDate } from "@/lib/time/week";

export interface SeededAdmin {
  id: string;
  email: string;
}

async function ensureTestTenant(prisma: PrismaClient, tenantId?: string) {
  if (tenantId) {
    return tenantId;
  }
  const tenant = await prisma.tenant.upsert({
    where: { slug: "test-default" },
    update: { name: "Test Default Tenant" },
    create: { id: "test-default", name: "Test Default Tenant", slug: "test-default" },
  });
  return tenant.id;
}

export async function seedAdmin(
  prisma: PrismaClient,
  email = `admin-${randomUUID()}@test.local`,
  tenantId?: string,
): Promise<SeededAdmin> {
  const effectiveTenantId = await ensureTestTenant(prisma, tenantId);
  const u = await prisma.user.create({
    data: { tenantId: effectiveTenantId, email, passwordHash: "x", role: "ADMIN" },
  });
  return { id: u.id, email: u.email };
}

export async function seedLocation(
  prisma: PrismaClient,
  name = "Test Location",
  holidayRegionCode = "EVANGELISCH",
  tenantId?: string,
): Promise<string> {
  const effectiveTenantId = await ensureTestTenant(prisma, tenantId);
  const l = await prisma.location.create({
    data: { tenantId: effectiveTenantId, name, holidayRegionCode },
  });
  return l.id;
}

export interface SeedEmployeeOpts {
  locationId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  pensum?: number;
  weeklyTargetMinutes?: number;
  hazMinutesPerWeek?: number;
  tztModel?: "DAILY_QUOTA" | "TARGET_REDUCTION";
  tztPeriodicQuotaDays?: number | null;
  tztPeriodMonths?: number | null;
  tztLastGrantedAt?: Date | null;
  vacationDaysPerYear?: number;
  entryDate?: Date;
  exitDate?: Date | null;
  isActive?: boolean;
  tenantId?: string;
}

export interface SeededEmployee {
  id: string;
  tenantId: string;
  userId: string;
  locationId: string;
}

export async function seedEmployee(
  prisma: PrismaClient,
  opts: SeedEmployeeOpts = {},
): Promise<SeededEmployee> {
  const tenantId = await ensureTestTenant(prisma, opts.tenantId);
  const locationId = opts.locationId ?? (await seedLocation(prisma, "Test Location", "ZH", tenantId));
  const user = await prisma.user.create({
    data: {
      tenantId,
      email: opts.email ?? `e-${randomUUID()}@test.local`,
      passwordHash: "x",
      role: "EMPLOYEE",
    },
  });
  const employee = await prisma.employee.create({
    data: {
      tenantId,
      userId: user.id,
      firstName: opts.firstName ?? "Anna",
      lastName: opts.lastName ?? "Müller",
      pensum: opts.pensum ?? 100,
      entryDate: opts.entryDate ?? new Date(2024, 0, 1),
      exitDate: opts.exitDate ?? null,
      locationId,
      vacationDaysPerYear: opts.vacationDaysPerYear ?? 25,
      weeklyTargetMinutes: opts.weeklyTargetMinutes ?? 2520,
      hazMinutesPerWeek: opts.hazMinutesPerWeek ?? 2700,
      tztModel: opts.tztModel ?? "DAILY_QUOTA",
      tztPeriodicQuotaDays: opts.tztPeriodicQuotaDays ?? null,
      tztPeriodMonths: opts.tztPeriodMonths ?? null,
      tztLastGrantedAt: opts.tztLastGrantedAt ?? null,
      isActive: opts.isActive ?? true,
    },
  });
  return { id: employee.id, tenantId, userId: user.id, locationId };
}

export async function seedHoliday(
  prisma: PrismaClient,
  locationId: string,
  isoDate: string,
  name = "Feiertag",
  tenantId?: string,
): Promise<string> {
  const effectiveTenantId = await ensureTestTenant(prisma, tenantId);
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Invalid ISO date: ${isoDate}`);
  const h = await prisma.holiday.create({
    data: { tenantId: effectiveTenantId, locationId, date, name },
  });
  return h.id;
}

export async function seedDraftWeek(
  prisma: PrismaClient,
  year: number,
  weekNumber: number,
  tenantId?: string,
): Promise<string> {
  const effectiveTenantId = await ensureTestTenant(prisma, tenantId);
  const w = await prisma.week.create({
    data: { tenantId: effectiveTenantId, year, weekNumber, status: "DRAFT" },
  });
  return w.id;
}

export interface SeedShiftOpts {
  weekId: string;
  employeeId: string;
  isoDate: string;
  plannedMinutes: number;
}

export async function seedShiftEntry(
  prisma: PrismaClient,
  opts: SeedShiftOpts,
): Promise<string> {
  const date = parseIsoDate(opts.isoDate);
  if (!date) throw new Error(`Invalid ISO date: ${opts.isoDate}`);
  const e = await prisma.planEntry.create({
    data: {
      weekId: opts.weekId,
      employeeId: opts.employeeId,
      date,
      kind: "ONE_TIME_SHIFT",
      plannedMinutes: opts.plannedMinutes,
      oneTimeStart: "08:00",
      oneTimeEnd: "17:00",
      oneTimeBreakMinutes: 30,
    },
  });
  return e.id;
}

export type SeededAbsenceType =
  | "VACATION"
  | "SICK"
  | "ACCIDENT"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "UNPAID"
  | "TZT"
  | "PARENTAL_CARE"
  | "MILITARY_SERVICE"
  | "CIVIL_PROTECTION_SERVICE"
  | "CIVIL_SERVICE"
  | "HOLIDAY_AUTO";

export interface SeedAbsenceOpts {
  weekId: string;
  employeeId: string;
  isoDate: string;
  absenceType: SeededAbsenceType;
}

export async function seedAbsenceEntry(
  prisma: PrismaClient,
  opts: SeedAbsenceOpts,
): Promise<string> {
  const date = parseIsoDate(opts.isoDate);
  if (!date) throw new Error(`Invalid ISO date: ${opts.isoDate}`);
  const e = await prisma.planEntry.create({
    data: {
      weekId: opts.weekId,
      employeeId: opts.employeeId,
      date,
      kind: "ABSENCE",
      absenceType: opts.absenceType,
      plannedMinutes: 0,
    },
  });
  return e.id;
}
