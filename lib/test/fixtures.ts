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

export async function seedAdmin(
  prisma: PrismaClient,
  email = `admin-${randomUUID()}@test.local`,
): Promise<SeededAdmin> {
  const u = await prisma.user.create({
    data: { email, passwordHash: "x", role: "ADMIN" },
  });
  return { id: u.id, email: u.email };
}

export async function seedLocation(
  prisma: PrismaClient,
  name = "Test Location",
  holidayRegionCode = "ZH",
): Promise<string> {
  const l = await prisma.location.create({
    data: { name, holidayRegionCode },
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
  vacationDaysPerYear?: number;
  isActive?: boolean;
}

export interface SeededEmployee {
  id: string;
  userId: string;
  locationId: string;
}

export async function seedEmployee(
  prisma: PrismaClient,
  opts: SeedEmployeeOpts = {},
): Promise<SeededEmployee> {
  const locationId = opts.locationId ?? (await seedLocation(prisma));
  const user = await prisma.user.create({
    data: {
      email: opts.email ?? `e-${randomUUID()}@test.local`,
      passwordHash: "x",
      role: "EMPLOYEE",
    },
  });
  const employee = await prisma.employee.create({
    data: {
      userId: user.id,
      firstName: opts.firstName ?? "Anna",
      lastName: opts.lastName ?? "Müller",
      pensum: opts.pensum ?? 100,
      entryDate: new Date(2024, 0, 1),
      locationId,
      vacationDaysPerYear: opts.vacationDaysPerYear ?? 25,
      weeklyTargetMinutes: opts.weeklyTargetMinutes ?? 2520,
      hazMinutesPerWeek: opts.hazMinutesPerWeek ?? 2700,
      isActive: opts.isActive ?? true,
    },
  });
  return { id: employee.id, userId: user.id, locationId };
}

export async function seedHoliday(
  prisma: PrismaClient,
  locationId: string,
  isoDate: string,
  name = "Feiertag",
): Promise<string> {
  const date = parseIsoDate(isoDate);
  if (!date) throw new Error(`Invalid ISO date: ${isoDate}`);
  const h = await prisma.holiday.create({
    data: { locationId, date, name },
  });
  return h.id;
}

export async function seedDraftWeek(
  prisma: PrismaClient,
  year: number,
  weekNumber: number,
): Promise<string> {
  const w = await prisma.week.create({
    data: { year, weekNumber, status: "DRAFT" },
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
  | "UNPAID"
  | "TZT"
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
