import { config as loadDotenv } from "dotenv";
import bcrypt from "bcryptjs";
import { addDays, getISOWeek } from "date-fns";
import { Prisma, PrismaClient } from "../lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { holidaysForRegion, type HolidayConfession } from "../lib/holidays-ch";
import { shiftMinutes } from "../lib/planning/shift-minutes";
import { bitmaskFromWeekdayIndices } from "../lib/services/coverage";
import { buildHolidayLookup } from "../lib/time/holidays";
import {
  computeWeeklyBalance,
  type PlanEntryByDate,
} from "../lib/time/balance";
import {
  baseDailySollMinutes,
  effectiveStandardWorkDays,
} from "../lib/time/soll";
import {
  currentIsoWeek,
  isoDateString,
  isoWeekDays,
} from "../lib/time/week";
import type {
  AbsenceType,
  AccountType,
  AccountUnit,
  BookingType,
  CompensationCaseStatus,
  ErtCaseStatus,
  PlanEntryKind,
  RequestStatus,
  RequestType,
  TztModel,
  WeekendWorkClassification,
  WeekStatus,
} from "../lib/generated/prisma/enums";

// Same order as `prisma/seed.ts`: `.env.local` wins over `.env`.
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

const PASSWORD = "perf123";
const SHARED_ADMIN_EMAIL = "perf.admin@demo.local";
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_TENANT_COUNT = 30;
const DEFAULT_EMPLOYEE_COUNT = 50;
const DEFAULT_YEAR_COUNT = 3;

const ACCOUNT_TYPES: AccountType[] = [
  "ZEITSALDO",
  "FERIEN",
  "UEZ",
  "TZT",
  "SONNTAG_FEIERTAG_KOMPENSATION",
  "PARENTAL_CARE",
];

const ACCOUNT_UNITS: Record<AccountType, AccountUnit> = {
  ZEITSALDO: "MINUTES",
  FERIEN: "MINUTES",
  UEZ: "MINUTES",
  TZT: "DAYS",
  SONNTAG_FEIERTAG_KOMPENSATION: "MINUTES",
  PARENTAL_CARE: "DAYS",
};

interface LocationSpec {
  key: string;
  name: string;
  holidayRegionCode: HolidayConfession;
}

interface EmployeeSpec {
  key: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
  pensum: number;
  vacationDaysPerYear: number;
  standardWorkDays: number;
  locationKey: string;
  tztModel: TztModel;
  tztPeriodicQuotaDays?: number;
  tztPeriodMonths?: number;
}

interface TenantSpec {
  key: string;
  slug: string;
  name: string;
  defaultStandardWorkDays: number;
  defaultWeeklyTargetMinutes: number;
  defaultHazMinutesPerWeek: number;
  uezPayoutPolicy: "ALLOWED" | "WITH_NOTICE" | "BLOCKED";
  locations: LocationSpec[];
  employees: EmployeeSpec[];
}

interface TenantBlueprint extends Omit<TenantSpec, "employees"> {
  baseEmployees: EmployeeSpec[];
}

interface ServiceSeed {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  comment: string;
  defaultDays: number | null;
  requiredCount: number | null;
  blockColorHex: string;
}

interface SeedEmployee {
  spec: EmployeeSpec;
  tenantId: string;
  userId: string;
  id: string;
  email: string;
  locationId: string;
  index: number;
  weeklyTargetMinutes: number;
  hazMinutesPerWeek: number;
}

interface EntryDraft {
  kind: PlanEntryKind;
  serviceCode: string | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeBreakMinutes: number | null;
  oneTimeLabel: string | null;
  absenceType: AbsenceType | null;
  weekendWorkClassification: WeekendWorkClassification | null;
  plannedMinutes: number;
  comment: string | null;
}

interface WeekSeed {
  id: string;
  tenantId: string;
  tenantKey: string;
  year: number;
  weekNumber: number;
  status: WeekStatus;
  days: ReturnType<typeof isoWeekDays>;
  publishedAt: Date | null;
  closedAt: Date | null;
}

interface BalanceState {
  id: string;
  tenantId: string;
  employeeId: string;
  accountType: AccountType;
  year: number;
  openingValue: number;
  currentValue: number;
  unit: AccountUnit;
}

const BASE_TENANT_BLUEPRINTS: TenantBlueprint[] = [
  {
    key: "alpen",
    slug: "local-perf-alpen",
    name: "Local Performance Alpenmarkt",
    defaultStandardWorkDays: 5,
    defaultWeeklyTargetMinutes: 42 * 60,
    defaultHazMinutesPerWeek: 45 * 60,
    uezPayoutPolicy: "WITH_NOTICE",
    locations: [
      {
        key: "luzern",
        name: "Alpenmarkt Luzern",
        holidayRegionCode: "KATHOLISCH",
      },
      {
        key: "zuerich",
        name: "Alpenmarkt Zuerich",
        holidayRegionCode: "EVANGELISCH",
      },
    ],
    baseEmployees: [
      {
        key: "mara",
        firstName: "Mara",
        lastName: "Baumann",
        roleLabel: "Teamleitung Verkauf",
        pensum: 100,
        vacationDaysPerYear: 25,
        standardWorkDays: 5,
        locationKey: "luzern",
        tztModel: "DAILY_QUOTA",
        tztPeriodicQuotaDays: 1,
        tztPeriodMonths: 3,
      },
      {
        key: "elias",
        firstName: "Elias",
        lastName: "Frei",
        roleLabel: "Backoffice",
        pensum: 80,
        vacationDaysPerYear: 25,
        standardWorkDays: 4,
        locationKey: "luzern",
        tztModel: "TARGET_REDUCTION",
      },
      {
        key: "sofia",
        firstName: "Sofia",
        lastName: "Rossi",
        roleLabel: "Kasse und Service",
        pensum: 60,
        vacationDaysPerYear: 22,
        standardWorkDays: 3,
        locationKey: "zuerich",
        tztModel: "DAILY_QUOTA",
        tztPeriodicQuotaDays: 0.5,
        tztPeriodMonths: 3,
      },
      {
        key: "tim",
        firstName: "Tim",
        lastName: "Wenger",
        roleLabel: "Aushilfe Administration",
        pensum: 50,
        vacationDaysPerYear: 20,
        standardWorkDays: 3,
        locationKey: "zuerich",
        tztModel: "DAILY_QUOTA",
        tztPeriodicQuotaDays: 0.5,
        tztPeriodMonths: 6,
      },
    ],
  },
  {
    key: "limmat",
    slug: "local-perf-limmat",
    name: "Local Performance Limmat Services",
    defaultStandardWorkDays: 5,
    defaultWeeklyTargetMinutes: 42 * 60,
    defaultHazMinutesPerWeek: 45 * 60,
    uezPayoutPolicy: "ALLOWED",
    locations: [
      {
        key: "dietikon",
        name: "Limmat Services Dietikon",
        holidayRegionCode: "EVANGELISCH",
      },
      {
        key: "baden",
        name: "Limmat Services Baden",
        holidayRegionCode: "KATHOLISCH",
      },
    ],
    baseEmployees: [
      {
        key: "nina",
        firstName: "Nina",
        lastName: "Graf",
        roleLabel: "Filialleitung",
        pensum: 100,
        vacationDaysPerYear: 25,
        standardWorkDays: 5,
        locationKey: "dietikon",
        tztModel: "DAILY_QUOTA",
        tztPeriodicQuotaDays: 1,
        tztPeriodMonths: 3,
      },
      {
        key: "omar",
        firstName: "Omar",
        lastName: "Keller",
        roleLabel: "Lager und Disposition",
        pensum: 80,
        vacationDaysPerYear: 25,
        standardWorkDays: 4,
        locationKey: "dietikon",
        tztModel: "TARGET_REDUCTION",
      },
      {
        key: "julia",
        firstName: "Julia",
        lastName: "Steiner",
        roleLabel: "Kundendienst",
        pensum: 60,
        vacationDaysPerYear: 22,
        standardWorkDays: 3,
        locationKey: "baden",
        tztModel: "DAILY_QUOTA",
        tztPeriodicQuotaDays: 0.5,
        tztPeriodMonths: 3,
      },
      {
        key: "ben",
        firstName: "Ben",
        lastName: "Widmer",
        roleLabel: "Aushilfe",
        pensum: 50,
        vacationDaysPerYear: 20,
        standardWorkDays: 3,
        locationKey: "baden",
        tztModel: "DAILY_QUOTA",
        tztPeriodicQuotaDays: 0.5,
        tztPeriodMonths: 6,
      },
    ],
  },
];

const GENERATED_TENANT_NAMES = [
  "Rheinblick",
  "Seeland",
  "Saentis",
  "Jura",
  "Pilatus",
  "Aare",
  "Gotthard",
  "Moesa",
  "Rigi",
  "Bodensee",
  "Rhone",
  "Bachtel",
  "Simplon",
  "Engadin",
  "Sihl",
  "Tamina",
  "Birseck",
  "Mendrisiotto",
  "Thur",
  "Napf",
  "Wyna",
  "Glattal",
  "Valais",
  "Gruyere",
  "La Cote",
  "Chablais",
  "Toggenburg",
  "Sursee",
];

const GENERATED_CITY_PAIRS: Array<
  [string, HolidayConfession, string, HolidayConfession]
> = [
  ["Aarau", "EVANGELISCH", "Olten", "KATHOLISCH"],
  ["Winterthur", "EVANGELISCH", "Zug", "KATHOLISCH"],
  ["St. Gallen", "KATHOLISCH", "Wil", "KATHOLISCH"],
  ["Biel", "EVANGELISCH", "Solothurn", "KATHOLISCH"],
  ["Thun", "EVANGELISCH", "Interlaken", "EVANGELISCH"],
  ["Chur", "KATHOLISCH", "Davos", "EVANGELISCH"],
  ["Fribourg", "KATHOLISCH", "Murten", "EVANGELISCH"],
  ["Schaffhausen", "EVANGELISCH", "Frauenfeld", "EVANGELISCH"],
];

const FIRST_NAMES = [
  "Lea",
  "Jonas",
  "Mia",
  "Noah",
  "Lina",
  "Luis",
  "Emma",
  "Leon",
  "Sara",
  "Nico",
  "Laura",
  "David",
  "Alina",
  "Jan",
  "Elena",
  "Simon",
  "Livia",
  "Fabian",
  "Melina",
  "Luca",
  "Amelie",
  "Robin",
  "Nora",
  "Mauro",
  "Chiara",
  "Florian",
  "Anja",
  "Patrick",
  "Selina",
  "Tobias",
  "Vanessa",
  "Kevin",
  "Carla",
  "Matteo",
  "Iris",
  "Dario",
  "Monika",
  "Andrin",
  "Rahel",
  "Silvan",
  "Jasmin",
  "Pascal",
  "Tanja",
  "Dominik",
  "Aline",
  "Marco",
  "Celine",
  "Philipp",
  "Tamara",
  "Ramon",
  "Bianca",
  "Sandro",
  "Helena",
  "Joel",
  "Claudia",
  "Raphael",
  "Yara",
  "Martin",
  "Nadine",
  "Adrian",
];

const LAST_NAMES = [
  "Mueller",
  "Schmid",
  "Meier",
  "Keller",
  "Weber",
  "Huber",
  "Meyer",
  "Schneider",
  "Steiner",
  "Fischer",
  "Brunner",
  "Baumann",
  "Gerber",
  "Frei",
  "Moser",
  "Bucher",
  "Roth",
  "Graf",
  "Widmer",
  "Suter",
  "Hofmann",
  "Buehler",
  "Schmidlin",
  "Ammann",
  "Berger",
  "Kunz",
  "Wagner",
  "Peter",
  "Haller",
  "Lehmann",
  "Fuchs",
  "Marti",
  "Kaufmann",
  "Arnold",
  "Egli",
  "Stalder",
  "Hess",
  "Vogel",
  "Zeller",
  "Hofer",
  "Rossi",
  "Bernasconi",
  "Bianchi",
  "Gasser",
  "Imhof",
  "Lutz",
  "Rey",
  "Fankhauser",
  "Odermatt",
  "Schaerer",
  "Portmann",
  "Studer",
  "Tanner",
  "Wyss",
  "Zimmermann",
  "Blaser",
  "Forster",
  "Hug",
  "Lanz",
  "Wenger",
];

const ROLE_LABELS = [
  "Teamleitung",
  "Verkauf",
  "Backoffice",
  "Kasse",
  "Kundendienst",
  "Lager",
  "Service",
  "Administration",
  "Springer",
  "Aushilfe",
];

const LEGACY_EMAIL_KEYS = new Set([
  "mara",
  "elias",
  "sofia",
  "tim",
  "nina",
  "omar",
  "julia",
  "ben",
]);

function generatedEmployee(
  index: number,
  tenantIndex: number,
  locationKeys: string[],
): EmployeeSpec {
  const pensumPattern = [100, 90, 80, 70, 60, 50, 40, 30];
  const pensum = pensumPattern[(tenantIndex + index) % pensumPattern.length]!;
  const firstName =
    FIRST_NAMES[(tenantIndex * 11 + index * 3) % FIRST_NAMES.length]!;
  const lastName =
    LAST_NAMES[(tenantIndex * 13 + index * 5) % LAST_NAMES.length]!;
  const standardWorkDays =
    pensum >= 90 ? 5 : pensum >= 70 ? 4 : pensum >= 40 ? 3 : 2;
  const dailyQuota = (tenantIndex + index) % 5 !== 0;
  return {
    key: `ma${pad2(index + 1)}`,
    firstName,
    lastName,
    roleLabel: ROLE_LABELS[(tenantIndex + index) % ROLE_LABELS.length]!,
    pensum,
    vacationDaysPerYear: pensum >= 80 ? 25 : pensum >= 60 ? 22 : 20,
    standardWorkDays,
    locationKey: locationKeys[index % locationKeys.length]!,
    tztModel: dailyQuota ? "DAILY_QUOTA" : "TARGET_REDUCTION",
    tztPeriodicQuotaDays: dailyQuota ? (pensum >= 80 ? 1 : 0.5) : undefined,
    tztPeriodMonths: dailyQuota ? (pensum >= 60 ? 3 : 6) : undefined,
  };
}

function buildEmployeesForTenant(
  blueprint: TenantBlueprint,
  tenantIndex: number,
  employeeCount: number,
): EmployeeSpec[] {
  const employees = blueprint.baseEmployees.slice(0, employeeCount);
  const locationKeys = blueprint.locations.map((location) => location.key);
  for (let index = employees.length; index < employeeCount; index += 1) {
    employees.push(generatedEmployee(index, tenantIndex, locationKeys));
  }
  return employees;
}

function buildGeneratedTenant(index: number): TenantBlueprint {
  const label =
    GENERATED_TENANT_NAMES[(index - BASE_TENANT_BLUEPRINTS.length) % GENERATED_TENANT_NAMES.length] ??
    `Betrieb ${pad2(index + 1)}`;
  const cityPair = GENERATED_CITY_PAIRS[index % GENERATED_CITY_PAIRS.length]!;
  const key = `betrieb-${pad2(index + 1)}`;
  const name = `Local Performance ${label}`;
  return {
    key,
    slug: `local-perf-${key}`,
    name,
    defaultStandardWorkDays: 5,
    defaultWeeklyTargetMinutes: 42 * 60,
    defaultHazMinutesPerWeek: 45 * 60,
    uezPayoutPolicy:
      index % 3 === 0 ? "WITH_NOTICE" : index % 5 === 0 ? "BLOCKED" : "ALLOWED",
    locations: [
      {
        key: "standort-a",
        name: `${name} ${cityPair[0]}`,
        holidayRegionCode: cityPair[1],
      },
      {
        key: "standort-b",
        name: `${name} ${cityPair[2]}`,
        holidayRegionCode: cityPair[3],
      },
    ],
    baseEmployees: [],
  };
}

function buildTenants(tenantCount: number, employeeCount: number): TenantSpec[] {
  return Array.from({ length: tenantCount }, (_, index) => {
    const blueprint =
      BASE_TENANT_BLUEPRINTS[index] ?? buildGeneratedTenant(index);
    return {
      ...blueprint,
      employees: buildEmployeesForTenant(blueprint, index, employeeCount),
    };
  });
}

const TENANT_COUNT = Math.max(
  1,
  readNumberEnv("LOCAL_PERF_SEED_TENANTS", DEFAULT_TENANT_COUNT),
);
const EMPLOYEE_COUNT = Math.max(
  1,
  readNumberEnv("LOCAL_PERF_SEED_EMPLOYEES", DEFAULT_EMPLOYEE_COUNT),
);
const TENANTS = buildTenants(TENANT_COUNT, EMPLOYEE_COUNT);

const SERVICES: ServiceSeed[] = [
  {
    code: "FRUEH",
    name: "Fruehschicht",
    startTime: "06:00",
    endTime: "14:30",
    breakMinutes: 30,
    comment: "Oeffnung, Kasse, Warenannahme",
    defaultDays: bitmaskFromWeekdayIndices([0, 1, 2, 3, 4]),
    requiredCount: 1,
    blockColorHex: "#2563eb",
  },
  {
    code: "MITTE",
    name: "Tagschicht",
    startTime: "09:00",
    endTime: "17:30",
    breakMinutes: 30,
    comment: "Tagesbetrieb und Kundenservice",
    defaultDays: bitmaskFromWeekdayIndices([0, 1, 2, 3, 4]),
    requiredCount: 1,
    blockColorHex: "#059669",
  },
  {
    code: "SPAET",
    name: "Spaetschicht",
    startTime: "13:00",
    endTime: "21:30",
    breakMinutes: 30,
    comment: "Abschluss, Kassensturz, Reinigung",
    defaultDays: bitmaskFromWeekdayIndices([0, 1, 2, 3, 4]),
    requiredCount: 1,
    blockColorHex: "#7c3aed",
  },
  {
    code: "SAMSTAG",
    name: "Samstagsdienst",
    startTime: "08:00",
    endTime: "17:00",
    breakMinutes: 45,
    comment: "Wochenendbetrieb",
    defaultDays: bitmaskFromWeekdayIndices([5]),
    requiredCount: 1,
    blockColorHex: "#ea580c",
  },
  {
    code: "ADMIN",
    name: "Admin- und Buerozeit",
    startTime: "08:30",
    endTime: "17:00",
    breakMinutes: 45,
    comment: "Planung, Bestellungen, Monatsabschluss",
    defaultDays: bitmaskFromWeekdayIndices([0, 1, 2, 3, 4]),
    requiredCount: null,
    blockColorHex: "#475569",
  },
];

function tenantId(key: string): string {
  return `tenant-local-perf-${key}`;
}

function adminUserId(key: string): string {
  return `user-local-perf-${key}-admin`;
}

function sharedAdminUserId(key: string): string {
  return `user-local-perf-${key}-shared-admin`;
}

function employeeUserId(tenantKey: string, employeeKey: string): string {
  return `user-local-perf-${tenantKey}-${employeeKey}`;
}

function employeeId(tenantKey: string, employeeKey: string): string {
  return `emp-local-perf-${tenantKey}-${employeeKey}`;
}

function locationId(tenantKey: string, locationKey: string): string {
  return `loc-local-perf-${tenantKey}-${locationKey}`;
}

function serviceId(tenantKey: string, code: string): string {
  return `svc-local-perf-${tenantKey}-${code.toLowerCase()}`;
}

function weekId(tenantKey: string, year: number, weekNumber: number): string {
  return `week-local-perf-${tenantKey}-${year}-${pad2(weekNumber)}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function accountBalanceId(
  tenantKey: string,
  employeeKey: string,
  accountType: AccountType,
  year: number,
): string {
  return `bal-local-perf-${tenantKey}-${employeeKey}-${accountType.toLowerCase()}-${year}`;
}

function emailFor(tenant: TenantSpec, employee: EmployeeSpec): string {
  const localPart = `${employee.firstName}.${employee.lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const uniqueLocalPart = LEGACY_EMAIL_KEYS.has(employee.key)
    ? localPart
    : `${localPart}.${employee.key}`;
  return `${uniqueLocalPart}@${tenant.slug}.test`;
}

function serviceByCode(code: string): ServiceSeed {
  const service = SERVICES.find((candidate) => candidate.code === code);
  if (!service) throw new Error(`Unknown service code ${code}`);
  return service;
}

function shift(
  serviceCode: string,
  weekendWorkClassification: WeekendWorkClassification | null = null,
  comment: string | null = null,
): EntryDraft {
  const service = serviceByCode(serviceCode);
  return {
    kind: "SHIFT",
    serviceCode,
    oneTimeStart: null,
    oneTimeEnd: null,
    oneTimeBreakMinutes: null,
    oneTimeLabel: null,
    absenceType: null,
    weekendWorkClassification,
    plannedMinutes: shiftMinutes(
      service.startTime,
      service.endTime,
      service.breakMinutes,
    ),
    comment,
  };
}

function oneTimeShift(
  label: string,
  start: string,
  end: string,
  breakMinutes: number,
  weekendWorkClassification: WeekendWorkClassification | null = null,
  comment: string | null = null,
): EntryDraft {
  return {
    kind: "ONE_TIME_SHIFT",
    serviceCode: null,
    oneTimeStart: start,
    oneTimeEnd: end,
    oneTimeBreakMinutes: breakMinutes,
    oneTimeLabel: label,
    absenceType: null,
    weekendWorkClassification,
    plannedMinutes: shiftMinutes(start, end, breakMinutes),
    comment,
  };
}

function absence(type: AbsenceType, comment: string | null = null): EntryDraft {
  return {
    kind: "ABSENCE",
    serviceCode: null,
    oneTimeStart: null,
    oneTimeEnd: null,
    oneTimeBreakMinutes: null,
    oneTimeLabel: null,
    absenceType: type,
    weekendWorkClassification: null,
    plannedMinutes: 0,
    comment,
  };
}

function vft(comment: string | null = "VFT / frei geplant"): EntryDraft {
  return {
    kind: "VFT",
    serviceCode: null,
    oneTimeStart: null,
    oneTimeEnd: null,
    oneTimeBreakMinutes: null,
    oneTimeLabel: null,
    absenceType: null,
    weekendWorkClassification: null,
    plannedMinutes: 0,
    comment,
  };
}

function halfDayOff(comment: string | null = "Freier Halbtag"): EntryDraft {
  return {
    kind: "HALF_DAY_OFF",
    serviceCode: null,
    oneTimeStart: null,
    oneTimeEnd: null,
    oneTimeBreakMinutes: null,
    oneTimeLabel: null,
    absenceType: null,
    weekendWorkClassification: null,
    plannedMinutes: 240,
    comment,
  };
}

function isWorkLike(entry: EntryDraft): boolean {
  return entry.kind === "SHIFT" || entry.kind === "ONE_TIME_SHIFT";
}

function isoWeeksInYear(year: number): number {
  return getISOWeek(new Date(year, 11, 28));
}

function isoScore(year: number, weekNumber: number): number {
  return year * 60 + weekNumber;
}

function weekStatusFor(
  year: number,
  weekNumber: number,
  current: { year: number; weekNumber: number },
): WeekStatus {
  const score = isoScore(year, weekNumber);
  const currentScore = isoScore(current.year, current.weekNumber);
  if (score < currentScore) return "CLOSED";
  if (score <= currentScore + 8) return "PUBLISHED";
  return "DRAFT";
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function baseSchedule(
  employeeIndex: number,
  weekNumber: number,
  dayIndex: number,
  weekOrdinal: number,
): EntryDraft {
  if (dayIndex === 6 && employeeIndex === 0 && weekNumber % 17 === 0) {
    return oneTimeShift(
      "Sonntagsinventur",
      "10:00",
      "14:00",
      0,
      "ADDITIONAL",
      "Zusaetzliche Inventur am Sonntag",
    );
  }

  const weekdayService = ["FRUEH", "MITTE", "SPAET"][
    (weekOrdinal + dayIndex + employeeIndex) % 3
  ]!;
  const pattern = employeeIndex % 8;

  if (pattern === 0) {
    if (weekNumber % 4 === 0) {
      if (dayIndex === 0 || dayIndex === 6) return vft("Ausgleich / frei");
      if (dayIndex === 5) {
        return shift("SAMSTAG", "REGULAR_SHIFTED", "Regulaer verschobener Samstag");
      }
      return shift(weekdayService);
    }
    if (dayIndex <= 4) return shift(weekdayService);
    return vft();
  }

  if (pattern === 1) {
    if (weekNumber % 6 === 2) {
      if (dayIndex === 1 || dayIndex === 6) return vft("Ausgleich Samstag");
      if (dayIndex === 5) {
        return shift("SAMSTAG", "REGULAR_SHIFTED", "Regulaer verschobener Samstag");
      }
      if ([0, 2, 3, 4].includes(dayIndex)) return shift(weekdayService);
      return vft();
    }
    if ([1, 2, 3, 4].includes(dayIndex)) return shift(weekdayService);
    return vft();
  }

  if (pattern === 2) {
    if (weekNumber % 2 === 0) {
      if ([0, 2, 4].includes(dayIndex)) return shift(weekdayService);
      return vft();
    }
    if ([1, 3].includes(dayIndex)) return shift(weekdayService);
    if (dayIndex === 5) {
      return shift("SAMSTAG", "REGULAR_SHIFTED", "Regulaerer Teilzeit-Samstag");
    }
    return vft();
  }

  if (pattern === 3) {
    if (dayIndex === 1) {
      return oneTimeShift("Halbtagsdienst Vormittag", "08:00", "13:00", 0);
    }
    if (dayIndex === 3) {
      return oneTimeShift("Halbtagsdienst Nachmittag", "13:00", "18:00", 0);
    }
    if (weekNumber % 3 === 0 && dayIndex === 5) {
      return oneTimeShift(
        "Samstagsaushilfe",
        "09:00",
        "13:00",
        0,
        "REGULAR_SHIFTED",
      );
    }
    if (weekNumber % 8 === 0 && dayIndex === 4) return halfDayOff();
    return vft();
  }

  if (pattern === 4) {
    if ([0, 1, 2, 3].includes(dayIndex)) return shift("ADMIN");
    if (dayIndex === 4) return halfDayOff("Freitagnachmittag frei");
    return vft();
  }

  if (pattern === 5) {
    if ([0, 1, 3, 4].includes(dayIndex)) return shift(weekdayService);
    if (weekNumber % 5 === 0 && dayIndex === 5) {
      return shift("SAMSTAG", "ADDITIONAL", "Zusaetzlicher Samstagseinsatz");
    }
    return vft();
  }

  if (pattern === 6) {
    if ([0, 2].includes(dayIndex)) return shift(weekdayService);
    if (dayIndex === 4) {
      return oneTimeShift("Abendverkauf", "16:00", "21:00", 0);
    }
    return vft();
  }

  if (dayIndex === 0) {
    return oneTimeShift("Springerdienst Morgen", "07:30", "12:30", 0);
  }
  if (dayIndex === 2) {
    return oneTimeShift("Springerdienst Nachmittag", "12:30", "18:00", 30);
  }
  if (dayIndex === 4 && weekNumber % 2 === 0) {
    return oneTimeShift("Freitagsaushilfe", "10:00", "15:00", 0);
  }
  if (weekNumber % 6 === 0 && dayIndex === 5) {
    return oneTimeShift("Halbtagsdienst Vormittag", "08:00", "13:00", 0);
  }
  return vft();
}

function vacationWeek(employeeIndex: number, weekNumber: number): boolean {
  const vacationsByEmployee = [
    [29, 30, 52],
    [15, 41],
    [8, 33],
    [25, 44],
  ];
  const fixedWeeks = vacationsByEmployee[employeeIndex];
  if (fixedWeeks) return fixedWeeks.includes(weekNumber);
  const summerWeek = 23 + ((employeeIndex * 3) % 11);
  const autumnWeek = 38 + ((employeeIndex * 5) % 8);
  const winterWeek = 3 + ((employeeIndex * 7) % 7);
  return [summerWeek, autumnWeek, winterWeek].includes(weekNumber);
}

function overrideForBusinessCase(
  employee: SeedEmployee,
  year: number,
  weekNumber: number,
  dayIndex: number,
  base: EntryDraft,
): EntryDraft | null {
  if (!isWorkLike(base)) return null;

  if (employee.index === 2 && weekNumber === 37 && dayIndex <= 4) {
    return absence("MILITARY_SERVICE", "Militaerdienst");
  }

  if (employee.index === 1 && weekNumber === 12 && [1, 2, 3].includes(dayIndex)) {
    return absence("ACCIDENT", "Unfallmeldung");
  }

  if (
    (weekNumber % 19 === 3 && dayIndex === 2) ||
    (weekNumber % 37 === 11 && [0, 1].includes(dayIndex))
  ) {
    return absence("SICK", "Krankmeldung");
  }

  if (employee.index === 3 && weekNumber === 6 && dayIndex === 1) {
    return absence("PARENTAL_CARE", "Betreuungsurlaub");
  }

  if (vacationWeek(employee.index, weekNumber) && dayIndex <= 4) {
    return absence("VACATION", "Ferien");
  }

  if (
    employee.spec.tztModel === "DAILY_QUOTA" &&
    weekNumber % 11 === 7 &&
    dayIndex === 2
  ) {
    return absence("TZT", "TZT-Bezug");
  }

  if (employee.index === 0 && weekNumber % 13 === 5 && dayIndex === 0) {
    return absence("UEZ_BEZUG", "UEZ-Bezug");
  }

  if ((weekNumber + employee.index) % 10 === 4 && dayIndex === 4) {
    return absence("FREE_REQUESTED", "Freier Tag zulasten Zeitsaldo");
  }

  if (employee.index === 2 && year % 2 === 0 && weekNumber === 45 && dayIndex === 3) {
    return absence("UNPAID", "Unbezahlter Urlaub");
  }

  return null;
}

function plannedEntryForDay(input: {
  employee: SeedEmployee;
  year: number;
  weekNumber: number;
  dayIndex: number;
  weekOrdinal: number;
  holidayName: string | null;
}): EntryDraft {
  const base = baseSchedule(
    input.employee.index,
    input.weekNumber,
    input.dayIndex,
    input.weekOrdinal,
  );

  if (input.holidayName && input.dayIndex <= 4) {
    const shouldWorkHoliday =
      isWorkLike(base) &&
      (input.weekNumber + input.employee.index) % 13 === 0;
    if (shouldWorkHoliday) {
      if (input.employee.index % 2 === 0) {
        return oneTimeShift(
          "Feiertagsdienst kurz",
          "08:00",
          "12:00",
          0,
          null,
          `Feiertagsdienst: ${input.holidayName}`,
        );
      }
      return shift("FRUEH", null, `Feiertagsdienst: ${input.holidayName}`);
    }
    return absence("HOLIDAY_AUTO", input.holidayName);
  }

  const override = overrideForBusinessCase(
    input.employee,
    input.year,
    input.weekNumber,
    input.dayIndex,
    base,
  );
  return override ?? base;
}

function toBalanceRow(
  entry: Prisma.PlanEntryCreateManyInput,
  servicesById: Map<string, ServiceSeed>,
): PlanEntryByDate {
  const service =
    typeof entry.serviceTemplateId === "string"
      ? servicesById.get(entry.serviceTemplateId)
      : null;
  return {
    date: isoDateString(entry.date as Date),
    kind: entry.kind as PlanEntryByDate["kind"],
    absenceType: (entry.absenceType as AbsenceType | null) ?? null,
    plannedMinutes: Number(entry.plannedMinutes ?? 0),
    weekendWorkClassification:
      (entry.weekendWorkClassification as WeekendWorkClassification | null) ??
      null,
    shiftStartTime:
      entry.kind === "SHIFT" && service
        ? service.startTime
        : entry.kind === "ONE_TIME_SHIFT"
          ? (entry.oneTimeStart as string | null)
          : null,
    shiftEndTime:
      entry.kind === "SHIFT" && service
        ? service.endTime
        : entry.kind === "ONE_TIME_SHIFT"
          ? (entry.oneTimeEnd as string | null)
          : null,
  };
}

function openingForAccount(
  employee: SeedEmployee,
  tenant: TenantSpec,
  accountType: AccountType,
): number {
  const standardDays = effectiveStandardWorkDays(
    employee.spec.standardWorkDays,
    tenant.defaultStandardWorkDays,
  );
  if (accountType === "FERIEN") {
    return (
      employee.spec.vacationDaysPerYear *
      baseDailySollMinutes(employee.weeklyTargetMinutes, standardDays)
    );
  }
  if (accountType === "ZEITSALDO") return (employee.index - 1) * 90;
  if (accountType === "UEZ") {
    return employee.index === 0 ? 120 : (employee.index % 10) * 30;
  }
  if (accountType === "TZT") {
    return employee.spec.tztModel === "DAILY_QUOTA"
      ? 1 + (employee.index % 6) * 0.5
      : 0;
  }
  if (accountType === "PARENTAL_CARE") return employee.index % 17 === 3 ? 3 : 0;
  return 0;
}

function requestTypeFromAbsence(type: AbsenceType): RequestType | null {
  switch (type) {
    case "VACATION":
      return "VACATION";
    case "FREE_REQUESTED":
      return "FREE_REQUESTED";
    case "UEZ_BEZUG":
      return "UEZ_BEZUG";
    case "TZT":
      return "TZT";
    case "PARENTAL_CARE":
      return "PARENTAL_CARE";
    default:
      return null;
  }
}

function statusDate(base: Date, offsetDays: number): Date {
  return addDays(base, offsetDays);
}

async function createManyInChunks<T>(
  label: string,
  rows: T[],
  createMany: (rows: T[]) => Promise<{ count: number }>,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<number> {
  let count = 0;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const result = await createMany(chunk);
    count += result.count;
  }
  console.log(`${label}: ${count}`);
  return count;
}

async function resetPerformanceTenants(): Promise<void> {
  const existing = await prisma.tenant.findMany({
    where: { slug: { startsWith: "local-perf-" } },
    select: { id: true, slug: true },
  });
  if (existing.length === 0) return;

  const tenantIds = existing.map((tenant) => tenant.id);
  console.log(`Resetting ${existing.length} existing local performance tenant(s)...`);

  await prisma.publishedSnapshot.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.accountBalance.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.ertCase.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.compensationCase.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.employeeExitSnapshot.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.privacyRequest.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.shiftWish.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.absenceRequest.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.planEntry.deleteMany({
    where: { week: { tenantId: { in: tenantIds } } },
  });
  await prisma.week.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.holiday.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.employee.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.serviceTemplate.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.location.deleteMany({ where: { tenantId: { in: tenantIds } } });
  // AuditLog is intentionally append-only in the database. Keep tenant/user rows
  // so historic audit rows remain valid, then upsert those base rows below.
}

async function upsertTenants(
  rows: Prisma.TenantCreateManyInput[],
): Promise<void> {
  for (const row of rows) {
    await prisma.tenant.upsert({
      where: { slug: String(row.slug) },
      create: row,
      update: {
        name: String(row.name),
        defaultStandardWorkDays: Number(row.defaultStandardWorkDays),
        defaultWeeklyTargetMinutes: Number(row.defaultWeeklyTargetMinutes),
        defaultHazMinutesPerWeek: Number(row.defaultHazMinutesPerWeek),
        zeitsaldoMinLimitMinutes:
          row.zeitsaldoMinLimitMinutes == null
            ? null
            : Number(row.zeitsaldoMinLimitMinutes),
        uezPayoutPolicy: String(row.uezPayoutPolicy),
        ertDueDays: Number(row.ertDueDays),
        compensationDueDays: Number(row.compensationDueDays),
        deletedAt: null,
        archivedUntil: null,
        deletedById: null,
      },
    });
  }
  console.log(`Tenants: ${rows.length}`);
}

async function upsertUsers(rows: Prisma.UserCreateManyInput[]): Promise<void> {
  for (const row of rows) {
    await prisma.user.upsert({
      where: { id: String(row.id) },
      create: row,
      update: {
        tenantId: String(row.tenantId),
        email: String(row.email),
        passwordHash: String(row.passwordHash),
        role: row.role,
        isActive: Boolean(row.isActive),
      },
    });
  }
  console.log(`Users: ${rows.length}`);
}

async function missingAuditRows(
  rows: Prisma.AuditLogCreateManyInput[],
): Promise<Prisma.AuditLogCreateManyInput[]> {
  const missing: Prisma.AuditLogCreateManyInput[] = [];
  for (let start = 0; start < rows.length; start += DEFAULT_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + DEFAULT_CHUNK_SIZE);
    const ids = chunk.map((row) => String(row.id));
    const existing = await prisma.auditLog.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((row) => row.id));
    missing.push(...chunk.filter((row) => !existingIds.has(String(row.id))));
  }
  return missing;
}

async function main(): Promise<void> {
  const now = new Date();
  const currentWeek = currentIsoWeek(now);
  const yearCount = Math.max(
    1,
    readNumberEnv("LOCAL_PERF_SEED_YEARS", DEFAULT_YEAR_COUNT),
  );
  const startIsoYear = readNumberEnv(
    "LOCAL_PERF_SEED_START_YEAR",
    currentWeek.year - yearCount + 1,
  );
  const years = Array.from({ length: yearCount }, (_, i) => startIsoYear + i);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log(
    `Seeding local performance data for ISO years ${years.join(", ")}...`,
  );
  await resetPerformanceTenants();

  const tenantRows: Prisma.TenantCreateManyInput[] = [];
  const locationRows: Prisma.LocationCreateManyInput[] = [];
  const userRows: Prisma.UserCreateManyInput[] = [];
  const employeeRows: Prisma.EmployeeCreateManyInput[] = [];
  const serviceRows: Prisma.ServiceTemplateCreateManyInput[] = [];
  const holidayRows: Prisma.HolidayCreateManyInput[] = [];
  const weekRows: Prisma.WeekCreateManyInput[] = [];
  const planEntryRows: Prisma.PlanEntryCreateManyInput[] = [];
  const snapshotRows: Prisma.PublishedSnapshotCreateManyInput[] = [];
  const absenceRequestRows: Prisma.AbsenceRequestCreateManyInput[] = [];
  const shiftWishRows: Prisma.ShiftWishCreateManyInput[] = [];
  const bookingRows: Prisma.BookingCreateManyInput[] = [];
  const accountBalanceRows: Prisma.AccountBalanceCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const ertCaseRows: Prisma.ErtCaseCreateManyInput[] = [];
  const compensationCaseRows: Prisma.CompensationCaseCreateManyInput[] = [];

  const allWeeks: WeekSeed[] = [];
  const employeesByTenant = new Map<string, SeedEmployee[]>();
  const locationsByTenant = new Map<string, Map<string, LocationSpec>>();
  const holidayByLocationIso = new Map<string, Map<string, string>>();
  const holidayRowsByLocation = new Map<
    string,
    Array<{ date: Date; name: string }>
  >();
  const servicesByTenant = new Map<string, Map<string, ServiceSeed>>();
  const servicesById = new Map<string, ServiceSeed>();
  const entriesByWeek = new Map<string, Prisma.PlanEntryCreateManyInput[]>();
  const entriesByEmployee = new Map<string, Prisma.PlanEntryCreateManyInput[]>();
  const balances = new Map<string, BalanceState>();

  for (const tenant of TENANTS) {
    const tId = tenantId(tenant.key);
    tenantRows.push({
      id: tId,
      name: tenant.name,
      slug: tenant.slug,
      defaultStandardWorkDays: tenant.defaultStandardWorkDays,
      defaultWeeklyTargetMinutes: tenant.defaultWeeklyTargetMinutes,
      defaultHazMinutesPerWeek: tenant.defaultHazMinutesPerWeek,
      zeitsaldoMinLimitMinutes: -20 * 60,
      uezPayoutPolicy: tenant.uezPayoutPolicy,
      ertDueDays: 28,
      compensationDueDays: 180,
    });

    userRows.push(
      {
        id: adminUserId(tenant.key),
        tenantId: tId,
        email: `perf.admin@${tenant.slug}.test`,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
      {
        id: sharedAdminUserId(tenant.key),
        tenantId: tId,
        email: SHARED_ADMIN_EMAIL,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    );

    const locByKey = new Map<string, LocationSpec>();
    locationsByTenant.set(tenant.key, locByKey);
    for (const location of tenant.locations) {
      locByKey.set(location.key, location);
      const locId = locationId(tenant.key, location.key);
      locationRows.push({
        id: locId,
        tenantId: tId,
        name: location.name,
        holidayRegionCode: location.holidayRegionCode,
      });
      const holidayIsoMap = new Map<string, string>();
      const holidayList: Array<{ date: Date; name: string }> = [];
      holidayByLocationIso.set(locId, holidayIsoMap);
      holidayRowsByLocation.set(locId, holidayList);
      for (const year of years) {
        for (const holiday of holidaysForRegion(
          location.holidayRegionCode,
          year,
        )) {
          holidayRows.push({
            id: `hol-local-perf-${tenant.key}-${location.key}-${isoDateString(holiday.date)}`,
            tenantId: tId,
            locationId: locId,
            date: holiday.date,
            name: holiday.name,
          });
          holidayIsoMap.set(isoDateString(holiday.date), holiday.name);
          holidayList.push({ date: holiday.date, name: holiday.name });
        }
      }
    }

    const serviceMap = new Map<string, ServiceSeed>();
    servicesByTenant.set(tenant.key, serviceMap);
    for (const service of SERVICES) {
      serviceMap.set(service.code, service);
      const sId = serviceId(tenant.key, service.code);
      servicesById.set(sId, service);
      serviceRows.push({
        id: sId,
        tenantId: tId,
        code: service.code,
        name: service.name,
        startTime: service.startTime,
        endTime: service.endTime,
        breakMinutes: service.breakMinutes,
        comment: service.comment,
        defaultDays: service.defaultDays,
        requiredCount: service.requiredCount,
        blockColorHex: service.blockColorHex,
        isActive: true,
      });
    }

    const tenantEmployees: SeedEmployee[] = [];
    employeesByTenant.set(tenant.key, tenantEmployees);
    for (let employeeIndex = 0; employeeIndex < tenant.employees.length; employeeIndex += 1) {
      const employee = tenant.employees[employeeIndex]!;
      const eUserId = employeeUserId(tenant.key, employee.key);
      const eId = employeeId(tenant.key, employee.key);
      const locId = locationId(tenant.key, employee.locationKey);
      const weeklyTargetMinutes = Math.round(
        (tenant.defaultWeeklyTargetMinutes * employee.pensum) / 100,
      );
      const hazMinutesPerWeek = Math.round(
        (tenant.defaultHazMinutesPerWeek * employee.pensum) / 100,
      );
      const email = emailFor(tenant, employee);

      userRows.push({
        id: eUserId,
        tenantId: tId,
        email,
        passwordHash,
        role: "EMPLOYEE",
        isActive: true,
      });
      employeeRows.push({
        id: eId,
        tenantId: tId,
        userId: eUserId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        roleLabel: employee.roleLabel,
        pensum: employee.pensum,
        entryDate: new Date(startIsoYear, 0, 1),
        locationId: locId,
        vacationDaysPerYear: employee.vacationDaysPerYear,
        weeklyTargetMinutes,
        hazMinutesPerWeek,
        tztModel: employee.tztModel,
        tztPeriodicQuotaDays: employee.tztPeriodicQuotaDays ?? null,
        tztPeriodMonths: employee.tztPeriodMonths ?? null,
        tztLastGrantedAt: new Date(startIsoYear, 0, 1),
        standardWorkDays: employee.standardWorkDays,
        isActive: true,
        status: "AKTIV",
      });
      tenantEmployees.push({
        spec: employee,
        tenantId: tId,
        userId: eUserId,
        id: eId,
        email,
        locationId: locId,
        index: employeeIndex,
        weeklyTargetMinutes,
        hazMinutesPerWeek,
      });
    }
  }

  let weekOrdinal = 0;
  for (const year of years) {
    const maxWeek = isoWeeksInYear(year);
    for (let weekNumber = 1; weekNumber <= maxWeek; weekNumber += 1) {
      const days = isoWeekDays(year, weekNumber);
      for (const tenant of TENANTS) {
        const tId = tenantId(tenant.key);
        const id = weekId(tenant.key, year, weekNumber);
        const status = weekStatusFor(year, weekNumber, currentWeek);
        const publishedAt =
          status === "DRAFT" ? null : statusDate(days[0]!.date, 3);
        const closedAt = status === "CLOSED" ? statusDate(days[6]!.date, 1) : null;
        weekRows.push({
          id,
          tenantId: tId,
          year,
          weekNumber,
          status,
          publishedAt,
          closedAt,
        });
        const weekSeed: WeekSeed = {
          id,
          tenantId: tId,
          tenantKey: tenant.key,
          year,
          weekNumber,
          status,
          days,
          publishedAt,
          closedAt,
        };
        allWeeks.push(weekSeed);

        for (const employee of employeesByTenant.get(tenant.key) ?? []) {
          for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
            const day = days[dayIndex]!;
            const holidayName =
              holidayByLocationIso.get(employee.locationId)?.get(day.iso) ?? null;
            const draft = plannedEntryForDay({
              employee,
              year,
              weekNumber,
              dayIndex,
              weekOrdinal,
              holidayName,
            });
            const entryId = `pe-local-perf-${tenant.key}-${year}-${pad2(
              weekNumber,
            )}-${employee.spec.key}-${dayIndex}`;
            const row: Prisma.PlanEntryCreateManyInput = {
              id: entryId,
              weekId: id,
              employeeId: employee.id,
              date: day.date,
              kind: draft.kind,
              serviceTemplateId: draft.serviceCode
                ? serviceId(tenant.key, draft.serviceCode)
                : null,
              oneTimeStart: draft.oneTimeStart,
              oneTimeEnd: draft.oneTimeEnd,
              oneTimeBreakMinutes: draft.oneTimeBreakMinutes,
              oneTimeLabel: draft.oneTimeLabel,
              absenceType: draft.absenceType,
              weekendWorkClassification: draft.weekendWorkClassification,
              plannedMinutes: draft.plannedMinutes,
              comment: draft.comment,
            };
            planEntryRows.push(row);
            const weekList = entriesByWeek.get(id) ?? [];
            weekList.push(row);
            entriesByWeek.set(id, weekList);
            const employeeList = entriesByEmployee.get(employee.id) ?? [];
            employeeList.push(row);
            entriesByEmployee.set(employee.id, employeeList);
          }
        }
      }
      weekOrdinal += 1;
    }
  }

  for (const week of allWeeks) {
    if (week.status === "DRAFT") continue;
    const tenant = TENANTS.find((candidate) => candidate.key === week.tenantKey)!;
    const employees = employeesByTenant.get(tenant.key) ?? [];
    const entries = entriesByWeek.get(week.id) ?? [];
    const holidays: Record<string, Array<{ iso: string; name: string }>> = {};
    for (const employee of employees) {
      holidays[employee.locationId] ??= [];
    }
    for (const location of tenant.locations) {
      const locId = locationId(tenant.key, location.key);
      const holidayMap = holidayByLocationIso.get(locId) ?? new Map();
      holidays[locId] = week.days
        .map((day) => {
          const name = holidayMap.get(day.iso);
          return name ? { iso: day.iso, name } : null;
        })
        .filter((row): row is { iso: string; name: string } => row !== null);
    }

    snapshotRows.push({
      id: `snap-local-perf-${tenant.key}-${week.year}-${pad2(week.weekNumber)}`,
      tenantId: week.tenantId,
      weekId: week.id,
      publishedAt: week.publishedAt ?? now,
      snapshotJson: JSON.stringify({
        year: week.year,
        weekNumber: week.weekNumber,
        publishedAt: (week.publishedAt ?? now).toISOString(),
        days: week.days.map((day) => day.iso),
        employees: employees.map((employee) => ({
          id: employee.id,
          firstName: employee.spec.firstName,
          lastName: employee.spec.lastName,
          roleLabel: employee.spec.roleLabel,
        })),
        entries: entries.map((entry) => {
          const service =
            typeof entry.serviceTemplateId === "string"
              ? servicesById.get(entry.serviceTemplateId)
              : null;
          return {
            id: entry.id,
            date: isoDateString(entry.date as Date),
            employeeId: entry.employeeId,
            kind: entry.kind,
            serviceTemplateId: entry.serviceTemplateId,
            serviceCode: service?.code ?? null,
            serviceName: service?.name ?? null,
            startTime: service?.startTime ?? null,
            endTime: service?.endTime ?? null,
            serviceBlockColorHex: service?.blockColorHex ?? null,
            breakMinutes: service?.breakMinutes ?? null,
            oneTimeStart: entry.oneTimeStart,
            oneTimeEnd: entry.oneTimeEnd,
            oneTimeBreakMinutes: entry.oneTimeBreakMinutes,
            oneTimeLabel: entry.oneTimeLabel,
            absenceType: entry.absenceType,
            plannedMinutes: entry.plannedMinutes,
            comment: entry.comment,
          };
        }),
        holidays,
      }),
    });

    auditRows.push({
      id: `audit-local-perf-${tenant.key}-${week.year}-${pad2(
        week.weekNumber,
      )}-publish`,
      tenantId: week.tenantId,
      userId: adminUserId(tenant.key),
      action: "PUBLISH",
      entity: "Week",
      entityId: week.id,
      oldValue: JSON.stringify({ status: "DRAFT" }),
      newValue: JSON.stringify({ status: week.status, entries: entries.length }),
      comment: "Lokaler Performance-Seed: Wochenplan publiziert",
      createdAt: week.publishedAt ?? now,
    });
    if (week.status === "CLOSED") {
      auditRows.push({
        id: `audit-local-perf-${tenant.key}-${week.year}-${pad2(
          week.weekNumber,
        )}-close`,
        tenantId: week.tenantId,
        userId: adminUserId(tenant.key),
        action: "CLOSE",
        entity: "Week",
        entityId: week.id,
        oldValue: JSON.stringify({ status: "PUBLISHED" }),
        newValue: JSON.stringify({ status: "CLOSED" }),
        comment: "Lokaler Performance-Seed: Woche abgeschlossen",
        createdAt: week.closedAt ?? now,
      });
    }
  }

  function balanceKey(
    employeeIdValue: string,
    accountType: AccountType,
    year: number,
  ): string {
    return `${employeeIdValue}:${accountType}:${year}`;
  }

  function ensureBalance(
    tenant: TenantSpec,
    employee: SeedEmployee,
    accountType: AccountType,
    year: number,
  ): BalanceState {
    const key = balanceKey(employee.id, accountType, year);
    const existing = balances.get(key);
    if (existing) return existing;
    const openingValue = openingForAccount(employee, tenant, accountType);
    const balance: BalanceState = {
      id: accountBalanceId(tenant.key, employee.spec.key, accountType, year),
      tenantId: employee.tenantId,
      employeeId: employee.id,
      accountType,
      year,
      openingValue,
      currentValue: openingValue,
      unit: ACCOUNT_UNITS[accountType],
    };
    balances.set(key, balance);
    return balance;
  }

  function addBooking(
    tenant: TenantSpec,
    employee: SeedEmployee,
    input: {
      id: string;
      accountType: AccountType;
      date: Date;
      value: number;
      bookingType: BookingType;
      comment: string;
      createdByUserId?: string;
    },
  ): void {
    if (input.value === 0) return;
    const year = input.date.getFullYear();
    const balance = ensureBalance(tenant, employee, input.accountType, year);
    bookingRows.push({
      id: input.id,
      tenantId: employee.tenantId,
      employeeId: employee.id,
      accountType: input.accountType,
      date: input.date,
      value: input.value,
      bookingType: input.bookingType,
      comment: input.comment,
      createdByUserId: input.createdByUserId ?? adminUserId(tenant.key),
    });
    if (input.bookingType !== "OPENING") {
      balance.currentValue += input.value;
    }
  }

  for (const tenant of TENANTS) {
    const employees = employeesByTenant.get(tenant.key) ?? [];
    for (const employee of employees) {
      for (const year of years) {
        for (const accountType of ACCOUNT_TYPES) {
          const balance = ensureBalance(tenant, employee, accountType, year);
          if (
            accountType !== "FERIEN" &&
            accountType !== "SONNTAG_FEIERTAG_KOMPENSATION" &&
            balance.openingValue !== 0
          ) {
            addBooking(tenant, employee, {
              id: `book-local-perf-${tenant.key}-${employee.spec.key}-${year}-${accountType.toLowerCase()}-opening`,
              accountType,
              date: new Date(year, 0, 1),
              value: balance.openingValue,
              bookingType: "OPENING",
              comment: "Anfangsbestand lokaler Performance-Seed",
            });
          }
        }

        if (employee.spec.tztModel === "DAILY_QUOTA") {
          for (const quarterMonth of [0, 3, 6, 9]) {
            addBooking(tenant, employee, {
              id: `book-local-perf-${tenant.key}-${employee.spec.key}-${year}-tzt-q${quarterMonth}`,
              accountType: "TZT",
              date: new Date(year, quarterMonth, 1),
              value: employee.spec.tztPeriodicQuotaDays ?? 0.5,
              bookingType: "MANUAL_CREDIT",
              comment: "TZT periodische Freigabe (Seed)",
            });
          }
        }
      }
    }
  }

  for (const week of allWeeks.filter((candidate) => candidate.status === "CLOSED")) {
    const tenant = TENANTS.find((candidate) => candidate.key === week.tenantKey)!;
    const employees = employeesByTenant.get(tenant.key) ?? [];
    const weekEntries = entriesByWeek.get(week.id) ?? [];
    const weekEntriesByEmployee = new Map<string, Prisma.PlanEntryCreateManyInput[]>();
    for (const entry of weekEntries) {
      const list = weekEntriesByEmployee.get(entry.employeeId as string) ?? [];
      list.push(entry);
      weekEntriesByEmployee.set(entry.employeeId as string, list);
    }

    for (const employee of employees) {
      const locationHolidays = holidayRowsByLocation.get(employee.locationId) ?? [];
      const holidayLookup = buildHolidayLookup(locationHolidays);
      const entries = (weekEntriesByEmployee.get(employee.id) ?? []).map((entry) =>
        toBalanceRow(entry, servicesById),
      );
      const streakContext = (entriesByEmployee.get(employee.id) ?? [])
        .filter((entry) => {
          const date = entry.date as Date;
          return (
            date >= addDays(week.days[0]!.date, -14) &&
            date < week.days[0]!.date
          );
        })
        .map((entry) => toBalanceRow(entry, servicesById));
      const result = computeWeeklyBalance(
        week.year,
        week.weekNumber,
        entries,
        holidayLookup,
        {
          weeklyTargetMinutes: employee.weeklyTargetMinutes,
          hazMinutesPerWeek: employee.hazMinutesPerWeek,
          tztModel: employee.spec.tztModel,
          standardWorkDays: effectiveStandardWorkDays(
            employee.spec.standardWorkDays,
            tenant.defaultStandardWorkDays,
          ),
          employmentRange: {
            entryIso: isoDateString(new Date(startIsoYear, 0, 1)),
          },
        },
        streakContext,
      );

      const sunday = week.days[6]!.date;
      let autoWeeklyZeitsaldoDelta = result.weeklyZeitsaldoDeltaMinutes;
      let bookingSequence = 0;
      const queueBooking = (
        accountType: AccountType,
        bookingType: BookingType,
        value: number,
        comment: string,
      ) => {
        bookingSequence += 1;
        addBooking(tenant, employee, {
          id: `book-local-perf-${tenant.key}-${employee.spec.key}-${week.year}-${pad2(
            week.weekNumber,
          )}-${bookingSequence}`,
          accountType,
          bookingType,
          value,
          date: sunday,
          comment,
        });
      };

      for (const day of result.days.filter(
        (candidate) => candidate.kind === "FREE_REQUESTED" && candidate.sollMinutes > 0,
      )) {
        queueBooking(
          "ZEITSALDO",
          "FREE_REQUESTED",
          -day.sollMinutes,
          `Freier Tag (Zeitsaldo) KW ${week.weekNumber}/${week.year}`,
        );
        autoWeeklyZeitsaldoDelta += day.sollMinutes;
      }
      for (const day of result.days.filter(
        (candidate) => candidate.kind === "UEZ_BEZUG" && candidate.sollMinutes > 0,
      )) {
        queueBooking(
          "UEZ",
          "UEZ_REDEMPTION",
          -day.sollMinutes,
          `UEZ-Bezug KW ${week.weekNumber}/${week.year}`,
        );
      }

      queueBooking(
        "ZEITSALDO",
        "AUTO_WEEKLY",
        autoWeeklyZeitsaldoDelta,
        `KW ${week.weekNumber}/${week.year}`,
      );
      queueBooking(
        "UEZ",
        "AUTO_WEEKLY",
        result.weeklyUezDeltaMinutes,
        `KW ${week.weekNumber}/${week.year}`,
      );
      queueBooking(
        "FERIEN",
        "AUTO_WEEKLY",
        -result.vacationMinutesDebit,
        `Ferienbezug KW ${week.weekNumber}/${week.year}`,
      );
      queueBooking(
        "PARENTAL_CARE",
        "AUTO_WEEKLY",
        -result.parentalCareDaysDebit,
        `Betreuungsurlaub KW ${week.weekNumber}/${week.year}`,
      );
      queueBooking(
        "SONNTAG_FEIERTAG_KOMPENSATION",
        "AUTO_WEEKLY",
        result.holidayCompensationMinutes,
        `Sonn-/Feiertagskompensation KW ${week.weekNumber}/${week.year}`,
      );

      for (const day of result.days) {
        if (day.kind !== "HOLIDAY_WORK" || day.plannedMinutes <= 0) continue;
        const triggerDate = new Date(`${day.iso}T00:00:00`);
        if (day.plannedMinutes > 300) {
          const dueAt = addDays(triggerDate, 28);
          const status: ErtCaseStatus = dueAt < now ? "OVERDUE" : "OPEN";
          ertCaseRows.push({
            id: `ert-local-perf-${tenant.key}-${employee.spec.key}-${day.iso}`,
            tenantId: employee.tenantId,
            employeeId: employee.id,
            triggerDate,
            holidayWorkMinutes: day.plannedMinutes,
            status,
            dueAt,
            note: "Seed: Feiertagsarbeit ueber 5 Stunden",
          });
        } else {
          const dueAt = addDays(triggerDate, 180);
          const status: CompensationCaseStatus =
            dueAt < now ? "EXPIRED" : "OPEN";
          compensationCaseRows.push({
            id: `comp-local-perf-${tenant.key}-${employee.spec.key}-${day.iso}`,
            tenantId: employee.tenantId,
            employeeId: employee.id,
            triggerDate,
            holidayWorkMinutes: day.plannedMinutes,
            status,
            dueAt,
            note: "Seed: Feiertagsarbeit bis 5 Stunden",
          });
        }
      }
    }
  }

  for (const tenant of TENANTS) {
    const employees = employeesByTenant.get(tenant.key) ?? [];
    for (const employee of employees) {
      for (const year of years) {
        addBooking(tenant, employee, {
          id: `book-local-perf-${tenant.key}-${employee.spec.key}-${year}-correction`,
          accountType: "ZEITSALDO",
          date: new Date(year, 5, 15),
          value: employee.index % 2 === 0 ? 45 : -30,
          bookingType: "CORRECTION",
          comment: "Korrektur Stempelfehler (Seed)",
        });
        addBooking(tenant, employee, {
          id: `book-local-perf-${tenant.key}-${employee.spec.key}-${year}-manual`,
          accountType: "UEZ",
          date: new Date(year, 8, 20),
          value: employee.index === 0 ? -60 : 30,
          bookingType: employee.index === 0 ? "UEZ_PAYOUT" : "MANUAL_CREDIT",
          comment: employee.index === 0
            ? "UEZ-Auszahlung mit Hinweis (Seed)"
            : "Manuelle UEZ-Gutschrift (Seed)",
        });
      }
    }
  }

  for (const balance of balances.values()) {
    accountBalanceRows.push({
      id: balance.id,
      tenantId: balance.tenantId,
      employeeId: balance.employeeId,
      accountType: balance.accountType,
      year: balance.year,
      openingValue: balance.openingValue,
      currentValue: balance.currentValue,
      unit: balance.unit,
    });
  }

  for (const tenant of TENANTS) {
    const employees = employeesByTenant.get(tenant.key) ?? [];
    let requestSequence = 0;
    const absenceEntries = planEntryRows
      .filter((entry) => entry.weekId.toString().includes(`-${tenant.key}-`))
      .filter((entry) => entry.kind === "ABSENCE" && entry.absenceType)
      .sort((a, b) => {
        const employeeCompare = String(a.employeeId).localeCompare(String(b.employeeId));
        if (employeeCompare !== 0) return employeeCompare;
        return (a.date as Date).getTime() - (b.date as Date).getTime();
      });

    let currentGroup:
      | {
          employeeId: string;
          type: RequestType;
          startDate: Date;
          endDate: Date;
          status: RequestStatus;
        }
      | null = null;

    function flushGroup(): void {
      if (!currentGroup) return;
      requestSequence += 1;
      absenceRequestRows.push({
        id: `req-local-perf-${tenant.key}-${requestSequence}`,
        tenantId: tenantId(tenant.key),
        employeeId: currentGroup.employeeId,
        type: currentGroup.type,
        startDate: currentGroup.startDate,
        endDate: currentGroup.endDate,
        status: currentGroup.status,
        comment: "Aus Planungs-Seed generierter Antrag",
        decisionComment:
          currentGroup.status === "APPROVED"
            ? "Genehmigt durch Performance-Seed"
            : null,
        decidedAt:
          currentGroup.status === "APPROVED"
            ? statusDate(currentGroup.startDate, -14)
            : null,
        decidedById:
          currentGroup.status === "APPROVED" ? adminUserId(tenant.key) : null,
      });
      currentGroup = null;
    }

    for (const entry of absenceEntries) {
      const type = requestTypeFromAbsence(entry.absenceType as AbsenceType);
      if (!type) continue;
      const date = entry.date as Date;
      const status: RequestStatus = date < now ? "APPROVED" : "OPEN";
      if (
        currentGroup &&
        currentGroup.employeeId === entry.employeeId &&
        currentGroup.type === type &&
        currentGroup.status === status &&
        addDays(currentGroup.endDate, 1).getTime() === date.getTime()
      ) {
        currentGroup.endDate = date;
      } else {
        flushGroup();
        currentGroup = {
          employeeId: entry.employeeId as string,
          type,
          startDate: date,
          endDate: date,
          status,
        };
      }
    }
    flushGroup();

    for (const employee of employees) {
      requestSequence += 1;
      absenceRequestRows.push({
        id: `req-local-perf-${tenant.key}-future-${employee.spec.key}`,
        tenantId: tenantId(tenant.key),
        employeeId: employee.id,
        type: "VACATION",
        startDate: addDays(now, 45 + employee.index * 3),
        endDate: addDays(now, 49 + employee.index * 3),
        status: "OPEN",
        comment: "Offener Ferienantrag fuer Performance-Tests",
      });
      absenceRequestRows.push({
        id: `req-local-perf-${tenant.key}-rejected-${employee.spec.key}`,
        tenantId: tenantId(tenant.key),
        employeeId: employee.id,
        type: "FREE_DAY",
        startDate: addDays(now, 20 + employee.index),
        endDate: addDays(now, 20 + employee.index),
        status: "REJECTED",
        comment: "Freier Tag war betrieblich nicht moeglich",
        decisionComment: "Zu wenig Abdeckung im Spaetdienst",
        decidedAt: addDays(now, -2),
        decidedById: adminUserId(tenant.key),
      });
    }

    for (const employee of employees) {
      for (const offset of [14, 28, 56]) {
        const wishDate = addDays(now, offset + employee.index);
        const preferredCode = ["FRUEH", "MITTE", "SPAET", "SAMSTAG"][
          (employee.index + offset) % 4
        ]!;
        const status: RequestStatus =
          offset === 14 ? "OPEN" : offset === 28 ? "APPROVED" : "REJECTED";
        shiftWishRows.push({
          id: `wish-local-perf-${tenant.key}-${employee.spec.key}-${offset}`,
          tenantId: tenantId(tenant.key),
          employeeId: employee.id,
          date: wishDate,
          preferredServiceTemplateId: serviceId(tenant.key, preferredCode),
          comment: "Dienstwunsch aus Performance-Seed",
          status,
          decisionComment:
            status === "OPEN" ? null : "Entscheid aus Performance-Seed",
          decidedAt: status === "OPEN" ? null : addDays(wishDate, -10),
          decidedById: status === "OPEN" ? null : adminUserId(tenant.key),
        });
      }
    }
  }

  await upsertTenants(tenantRows);
  await upsertUsers(userRows);
  await createManyInChunks("Locations", locationRows, (rows) =>
    prisma.location.createMany({ data: rows }),
  );
  await createManyInChunks("Service templates", serviceRows, (rows) =>
    prisma.serviceTemplate.createMany({ data: rows }),
  );
  await createManyInChunks("Employees", employeeRows, (rows) =>
    prisma.employee.createMany({ data: rows }),
  );
  await createManyInChunks("Holidays", holidayRows, (rows) =>
    prisma.holiday.createMany({ data: rows }),
  );
  await createManyInChunks("Weeks", weekRows, (rows) =>
    prisma.week.createMany({ data: rows }),
  );
  await createManyInChunks("Plan entries", planEntryRows, (rows) =>
    prisma.planEntry.createMany({ data: rows }),
  );
  await createManyInChunks("Published snapshots", snapshotRows, (rows) =>
    prisma.publishedSnapshot.createMany({ data: rows }),
  );
  await createManyInChunks("Absence requests", absenceRequestRows, (rows) =>
    prisma.absenceRequest.createMany({ data: rows }),
  );
  await createManyInChunks("Shift wishes", shiftWishRows, (rows) =>
    prisma.shiftWish.createMany({ data: rows }),
  );
  await createManyInChunks("Account balances", accountBalanceRows, (rows) =>
    prisma.accountBalance.createMany({ data: rows }),
  );
  await createManyInChunks("Bookings", bookingRows, (rows) =>
    prisma.booking.createMany({ data: rows }),
  );
  await createManyInChunks("ERT cases", ertCaseRows, (rows) =>
    prisma.ertCase.createMany({ data: rows }),
  );
  await createManyInChunks("Compensation cases", compensationCaseRows, (rows) =>
    prisma.compensationCase.createMany({ data: rows }),
  );
  const auditRowsToCreate = await missingAuditRows(auditRows);
  await createManyInChunks("Audit logs", auditRowsToCreate, (rows) =>
    prisma.auditLog.createMany({ data: rows }),
  );

  console.log("");
  console.log("Local performance seed complete.");
  console.log(`Password for all local performance users: ${PASSWORD}`);
  for (const tenant of TENANTS) {
    console.log(
      `- ${tenant.name} (${tenant.slug}): perf.admin@${tenant.slug}.test`,
    );
  }
  console.log(`- Shared multi-tenant admin: ${SHARED_ADMIN_EMAIL}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
