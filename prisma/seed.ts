import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { holidaysForRegion } from "../lib/holidays-ch";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

interface DemoEmployee {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
  pensum: number;
  vacationDaysPerYear: number;
}

const DEMO_EMPLOYEES: DemoEmployee[] = [
  {
    email: "anna.keller@demo.ch",
    password: "demo123",
    firstName: "Anna",
    lastName: "Keller",
    roleLabel: "Verkauf",
    pensum: 100,
    vacationDaysPerYear: 25,
  },
  {
    email: "marco.huber@demo.ch",
    password: "demo123",
    firstName: "Marco",
    lastName: "Huber",
    roleLabel: "Backoffice",
    pensum: 80,
    vacationDaysPerYear: 25,
  },
  {
    email: "lina.meier@demo.ch",
    password: "demo123",
    firstName: "Lina",
    lastName: "Meier",
    roleLabel: "Aushilfe",
    pensum: 40,
    vacationDaysPerYear: 20,
  },
  {
    email: "noah.schmid@demo.ch",
    password: "demo123",
    firstName: "Noah",
    lastName: "Schmid",
    roleLabel: "Bar",
    pensum: 60,
    vacationDaysPerYear: 22,
  },
];

async function main() {
  console.log("Seeding database...");

  const location = await prisma.location.upsert({
    where: { id: "loc-luzern" },
    update: { name: "Standort Luzern", holidayRegionCode: "LU" },
    create: {
      id: "loc-luzern",
      name: "Standort Luzern",
      holidayRegionCode: "LU",
    },
  });

  // Holidays for current year (LU).
  const year = new Date().getFullYear();
  for (const h of holidaysForRegion(location.holidayRegionCode, year)) {
    await prisma.holiday.upsert({
      where: { locationId_date: { locationId: location.id, date: h.date } },
      update: { name: h.name },
      create: { locationId: location.id, date: h.date, name: h.name },
    });
  }

  // Service templates.
  const services = [
    {
      code: "FRUEH",
      name: "Frühdienst",
      startTime: "07:00",
      endTime: "15:30",
      breakMinutes: 30,
      comment: "Kasse / Öffnung",
    },
    {
      code: "SPAET",
      name: "Spätdienst",
      startTime: "12:30",
      endTime: "21:00",
      breakMinutes: 30,
      comment: "Schliessdienst",
    },
    {
      code: "SAMSTAG",
      name: "Samstagsdienst",
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 45,
      comment: "Wochenend-Verkauf",
    },
  ];
  for (const s of services) {
    await prisma.serviceTemplate.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
  }

  // Admin user.
  const adminPwd = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@demo.ch" },
    update: { passwordHash: adminPwd, role: "ADMIN", isActive: true },
    create: {
      email: "admin@demo.ch",
      passwordHash: adminPwd,
      role: "ADMIN",
      isActive: true,
    },
  });

  // Demo employees + their User accounts.
  for (const e of DEMO_EMPLOYEES) {
    const pwd = await bcrypt.hash(e.password, 10);
    const user = await prisma.user.upsert({
      where: { email: e.email },
      update: { passwordHash: pwd, role: "EMPLOYEE", isActive: true },
      create: {
        email: e.email,
        passwordHash: pwd,
        role: "EMPLOYEE",
        isActive: true,
      },
    });

    await prisma.employee.upsert({
      where: { userId: user.id },
      update: {
        firstName: e.firstName,
        lastName: e.lastName,
        roleLabel: e.roleLabel,
        pensum: e.pensum,
        vacationDaysPerYear: e.vacationDaysPerYear,
        weeklyTargetMinutes: Math.round((42 * 60 * e.pensum) / 100),
        locationId: location.id,
      },
      create: {
        userId: user.id,
        firstName: e.firstName,
        lastName: e.lastName,
        roleLabel: e.roleLabel,
        pensum: e.pensum,
        entryDate: new Date(Date.UTC(year - 1, 0, 1)),
        vacationDaysPerYear: e.vacationDaysPerYear,
        weeklyTargetMinutes: Math.round((42 * 60 * e.pensum) / 100),
        hazMinutesPerWeek: 45 * 60,
        locationId: location.id,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
