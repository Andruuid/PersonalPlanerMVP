import { config as loadDotenv } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { holidaysForRegion } from "../lib/holidays-ch";

// Same order as `scripts/db-push-libsql.mts`: `.env.local` wins over `.env`.
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

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
  /** Stable seed id from DEMO_LOCATIONS */
  locationId: string;
}

const DEMO_LOCATIONS: Array<{
  id: string;
  name: string;
  holidayRegionCode: "EVANGELISCH" | "KATHOLISCH";
}> = [
  { id: "loc-luzern", name: "Standort Luzern", holidayRegionCode: "KATHOLISCH" },
  { id: "loc-bern", name: "Standort Bern", holidayRegionCode: "KATHOLISCH" },
  { id: "loc-zuerich", name: "Standort Zürich", holidayRegionCode: "EVANGELISCH" },
  { id: "loc-basel", name: "Standort Basel", holidayRegionCode: "KATHOLISCH" },
];

const DEMO_EMPLOYEES: DemoEmployee[] = [
  {
    email: "anna.keller@demo.ch",
    password: "demo123",
    firstName: "Anna",
    lastName: "Keller",
    roleLabel: "Verkauf",
    pensum: 100,
    vacationDaysPerYear: 25,
    locationId: "loc-luzern",
  },
  {
    email: "marco.huber@demo.ch",
    password: "demo123",
    firstName: "Marco",
    lastName: "Huber",
    roleLabel: "Backoffice",
    pensum: 80,
    vacationDaysPerYear: 25,
    locationId: "loc-bern",
  },
  {
    email: "lina.meier@demo.ch",
    password: "demo123",
    firstName: "Lina",
    lastName: "Meier",
    roleLabel: "Aushilfe",
    pensum: 40,
    vacationDaysPerYear: 20,
    locationId: "loc-zuerich",
  },
  {
    email: "noah.schmid@demo.ch",
    password: "demo123",
    firstName: "Noah",
    lastName: "Schmid",
    roleLabel: "Bar",
    pensum: 60,
    vacationDaysPerYear: 22,
    locationId: "loc-basel",
  },
];

async function main() {
  console.log("Seeding database...");

  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: "default" },
    update: { name: "Default Tenant" },
    create: { name: "Default Tenant", slug: "default" },
  });
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { name: "Demo Tenant" },
    create: { name: "Demo Tenant", slug: "demo" },
  });
  // Use the default tenant so auth lookups (tenantId: "default") match.
  const tenantId = defaultTenant.id;

  const year = new Date().getFullYear();
  for (const loc of DEMO_LOCATIONS) {
    await prisma.location.upsert({
      where: { id: loc.id },
      update: {
        tenantId,
        name: loc.name,
        holidayRegionCode: loc.holidayRegionCode,
      },
      create: {
        id: loc.id,
        tenantId,
        name: loc.name,
        holidayRegionCode: loc.holidayRegionCode,
      },
    });
  }

  for (const loc of DEMO_LOCATIONS) {
    for (const h of holidaysForRegion(loc.holidayRegionCode, year)) {
      await prisma.holiday.upsert({
        where: { locationId_date: { locationId: loc.id, date: h.date } },
        update: { tenantId, name: h.name },
        create: { tenantId, locationId: loc.id, date: h.date, name: h.name },
      });
    }
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
      where: { tenantId_code: { tenantId, code: s.code } },
      update: { ...s, tenantId },
      create: { ...s, tenantId },
    });
  }

  // Admin user.
  const adminPwd = await bcrypt.hash("admin123", 10);
  const existingAdmin = await prisma.user.findFirst({
    where: { tenantId, email: "admin@demo.ch" },
  });
  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { tenantId, passwordHash: adminPwd, role: "ADMIN", isActive: true },
    });
  } else {
    await prisma.user.create({
      data: {
        tenantId,
        email: "admin@demo.ch",
        passwordHash: adminPwd,
        role: "ADMIN",
        isActive: true,
      },
    });
  }

  // Platform system admin (not tenant-bound in session claims).
  const systemAdminPwd = await bcrypt.hash("system123", 10);
  const existingSystemAdmin = await prisma.user.findFirst({
    where: { tenantId, email: "system@platform.local" },
  });
  if (existingSystemAdmin) {
    await prisma.user.update({
      where: { id: existingSystemAdmin.id },
      data: {
        tenantId,
        passwordHash: systemAdminPwd,
        role: "SYSTEM_ADMIN",
        isActive: true,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        tenantId,
        email: "system@platform.local",
        passwordHash: systemAdminPwd,
        role: "SYSTEM_ADMIN",
        isActive: true,
      },
    });
  }

  // Demo employees + their User accounts.
  for (const e of DEMO_EMPLOYEES) {
    const pwd = await bcrypt.hash(e.password, 10);
    const existingUser = await prisma.user.findFirst({
      where: { tenantId, email: e.email },
    });
    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: { tenantId, passwordHash: pwd, role: "EMPLOYEE", isActive: true },
        })
      : await prisma.user.create({
          data: {
            tenantId,
            email: e.email,
            passwordHash: pwd,
            role: "EMPLOYEE",
            isActive: true,
          },
        });

    await prisma.employee.upsert({
      where: { userId: user.id },
      update: {
      tenantId,
        firstName: e.firstName,
        lastName: e.lastName,
        roleLabel: e.roleLabel,
        pensum: e.pensum,
        vacationDaysPerYear: e.vacationDaysPerYear,
        weeklyTargetMinutes: Math.round((42 * 60 * e.pensum) / 100),
        locationId: e.locationId,
      },
      create: {
        tenantId,
        userId: user.id,
        firstName: e.firstName,
        lastName: e.lastName,
        roleLabel: e.roleLabel,
        pensum: e.pensum,
        entryDate: new Date(Date.UTC(year - 1, 0, 1)),
        vacationDaysPerYear: e.vacationDaysPerYear,
        weeklyTargetMinutes: Math.round((42 * 60 * e.pensum) / 100),
        hazMinutesPerWeek: 45 * 60,
        locationId: e.locationId,
      },
    });
  }

  // Second-tenant sandbox admin reuses admin@demo.ch to validate tenant-scoped uniqueness.
  const demoSandboxAdminEmail = "admin@demo.ch";
  const demoTenantPwd = await bcrypt.hash("admin123", 10);
  const demoSlugAdmin = await prisma.user.findFirst({
    where: { tenantId: demoTenant.id, email: demoSandboxAdminEmail },
  });
  if (demoSlugAdmin) {
    await prisma.user.update({
      where: { id: demoSlugAdmin.id },
      data: {
        passwordHash: demoTenantPwd,
        role: "ADMIN",
        isActive: true,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        tenantId: demoTenant.id,
        email: demoSandboxAdminEmail,
        passwordHash: demoTenantPwd,
        role: "ADMIN",
        isActive: true,
      },
    });
  }

  console.log(`Seeded demo data for tenant "${defaultTenant.slug}".`);
  console.log(`Ensured fallback tenant "${demoTenant.slug}" exists.`);
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
