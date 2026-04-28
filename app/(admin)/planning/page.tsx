import { format } from "date-fns";
import { prisma } from "@/lib/db";
import {
  currentIsoWeek,
  isoDateString,
  isoWeekDays,
  startOfIsoWeek,
} from "@/lib/time/week";
import { getOrCreateWeekForTenant } from "@/server/week-helpers";
import { PlanningBoard } from "@/components/planning/planning-board";
import {
  entryKey,
  type EntryMap,
  type KpiSummary,
  type PlanEntryView,
  type RequestView,
  type ServiceOption,
  type WeekView,
} from "@/components/planning/types";
import {
  shiftKeyForAbsence,
  shiftKeyForServiceCode,
  type ShiftKey,
} from "@/lib/shift-style";
import { computeWeeklyBalance } from "@/lib/time/balance";
import { buildHolidayLookup } from "@/lib/time/holidays";
import type { PlanEntryByDate } from "@/lib/time/balance";
import { requireAdmin } from "@/server/_shared";

export const metadata = { title: "Wochenplanung · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{ year?: string; week?: string }>;
}

const STATUS_LABEL: Record<WeekView["status"], string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  CLOSED: "Abgeschlossen",
};

function pickWeek(
  raw: { year?: string; week?: string },
): { year: number; weekNumber: number } {
  const fallback = currentIsoWeek();
  const year = Number.parseInt(raw.year ?? "", 10);
  const weekNumber = Number.parseInt(raw.week ?? "", 10);
  if (
    Number.isFinite(year) &&
    Number.isFinite(weekNumber) &&
    weekNumber >= 1 &&
    weekNumber <= 53 &&
    year >= 2000 &&
    year <= 2100
  ) {
    return { year, weekNumber };
  }
  return fallback;
}

function buildSubtitle(view: PlanEntryView): string | null {
  if (view.kind === "SHIFT" && view.serviceTime) {
    return [view.serviceTime, view.serviceComment].filter(Boolean).join(" · ");
  }
  if (view.kind === "ONE_TIME_SHIFT") {
    const time =
      view.oneTimeStart && view.oneTimeEnd
        ? `${view.oneTimeStart} – ${view.oneTimeEnd}`
        : null;
    return [time, view.oneTimeLabel].filter(Boolean).join(" · ") || null;
  }
  return null;
}

function entryView(raw: {
  id: string;
  kind: string;
  serviceTemplateId: string | null;
  serviceTemplate: {
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    comment: string | null;
  } | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeBreakMinutes: number | null;
  oneTimeLabel: string | null;
  absenceType: string | null;
}): PlanEntryView {
  let shiftKey: ShiftKey = "EMPTY";
  let title = "Eintrag";

  if (raw.kind === "SHIFT" && raw.serviceTemplate) {
    shiftKey = shiftKeyForServiceCode(raw.serviceTemplate.code);
    title = raw.serviceTemplate.name;
  } else if (raw.kind === "ONE_TIME_SHIFT") {
    shiftKey = "FRUEH";
    title = raw.oneTimeLabel ?? "Einmal-Dienst";
  } else if (raw.kind === "VFT") {
    shiftKey = "FREI";
    title = "VFT";
  } else if (raw.kind === "ABSENCE" && raw.absenceType) {
    shiftKey = shiftKeyForAbsence(raw.absenceType);
    const labelMap: Record<string, string> = {
      VACATION: "Ferien",
      SICK: "Krank",
      ACCIDENT: "Unfall",
      FREE_REQUESTED: "Frei verlangt",
      UNPAID: "Unbezahlt",
      TZT: "TZT",
      PARENTAL_CARE: "Eltern-/Betreuungsurlaub",
      MILITARY_SERVICE: "Militärdienst",
      CIVIL_PROTECTION_SERVICE: "Zivilschutz",
      CIVIL_SERVICE: "Zivildienst",
      HOLIDAY_AUTO: "Feiertag",
    };
    title = labelMap[raw.absenceType] ?? "Abwesenheit";
  }

  const view: PlanEntryView = {
    id: raw.id,
    kind: raw.kind as PlanEntryView["kind"],
    serviceTemplateId: raw.serviceTemplateId,
    serviceCode: raw.serviceTemplate?.code ?? null,
    serviceName: raw.serviceTemplate?.name ?? null,
    serviceTime: raw.serviceTemplate
      ? `${raw.serviceTemplate.startTime} – ${raw.serviceTemplate.endTime}`
      : null,
    serviceComment: raw.serviceTemplate?.comment ?? null,
    oneTimeStart: raw.oneTimeStart,
    oneTimeEnd: raw.oneTimeEnd,
    oneTimeBreakMinutes: raw.oneTimeBreakMinutes,
    oneTimeLabel: raw.oneTimeLabel,
    absenceType: raw.absenceType as PlanEntryView["absenceType"],
    shiftKey,
    title,
    subtitle: null,
  };
  view.subtitle = buildSubtitle(view);
  return view;
}

function rangeLabel(startDate: Date, endDate: Date): string {
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return format(startDate, "dd.MM.");
  }
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  if (sameYear) {
    return `${format(startDate, "dd.MM.")} – ${format(endDate, "dd.MM.yyyy")}`;
  }
  return `${format(startDate, "dd.MM.yyyy")} – ${format(endDate, "dd.MM.yyyy")}`;
}

export default async function PlanningPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const raw = await searchParams;
  const { year, weekNumber } = pickWeek(raw);

  const week = await getOrCreateWeekForTenant(admin.tenantId, year, weekNumber);
  const days = isoWeekDays(year, weekNumber);
  const startDate = startOfIsoWeek(year, weekNumber);
  const endDate = days[6].date;

  const [employees, services, planEntries, openRequests, locations] =
    await Promise.all([
      prisma.employee.findMany({
        where: { tenantId: admin.tenantId, isActive: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          location: { select: { name: true } },
        },
      }),
      prisma.serviceTemplate.findMany({
        where: { tenantId: admin.tenantId, isActive: true },
        orderBy: { name: "asc" },
      }),
      prisma.planEntry.findMany({
        where: { weekId: week.id, employee: { tenantId: admin.tenantId } },
        include: {
          serviceTemplate: {
            select: {
              code: true,
              name: true,
              startTime: true,
              endTime: true,
              breakMinutes: true,
              comment: true,
            },
          },
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.absenceRequest.findMany({
        where: {
          tenantId: admin.tenantId,
          OR: [
            { status: "OPEN" },
            {
              AND: [
                { status: { in: ["APPROVED", "REJECTED"] } },
                { startDate: { lte: endDate } },
                { endDate: { gte: startDate } },
              ],
            },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.location.findMany({ where: { tenantId: admin.tenantId }, orderBy: { name: "asc" }, take: 1 }),
    ]);

  const entries: EntryMap = {};
  for (const e of planEntries) {
    const iso = isoDateString(e.date);
    entries[entryKey(e.employeeId, iso)] = entryView({
      id: e.id,
      kind: e.kind,
      serviceTemplateId: e.serviceTemplateId,
      serviceTemplate: e.serviceTemplate,
      oneTimeStart: e.oneTimeStart,
      oneTimeEnd: e.oneTimeEnd,
      oneTimeBreakMinutes: e.oneTimeBreakMinutes,
      oneTimeLabel: e.oneTimeLabel,
      absenceType: e.absenceType,
    });
  }

  const totalCells = employees.length * days.length;
  const filledCells = Object.keys(entries).length;
  const unassignedCells = Math.max(0, totalCells - filledCells);
  const locationIds = Array.from(new Set(employees.map((e) => e.locationId)));
  const holidays = await prisma.holiday.findMany({
    where: {
      tenantId: admin.tenantId,
      locationId: { in: locationIds },
      date: {
        gte: new Date(week.year - 1, 11, 1),
        lt: new Date(week.year + 1, 1, 1),
      },
    },
  });
  const holidaysByLocation = new Map<string, ReturnType<typeof buildHolidayLookup>>();
  for (const locId of locationIds) {
    holidaysByLocation.set(
      locId,
      buildHolidayLookup(
        holidays
          .filter((h) => h.locationId === locId)
          .map((h) => ({ date: h.date, name: h.name })),
      ),
    );
  }
  const entriesByEmployee = new Map<string, PlanEntryByDate[]>();
  for (const e of planEntries) {
    const list = entriesByEmployee.get(e.employeeId) ?? [];
    list.push({
      date: isoDateString(e.date),
      kind: e.kind,
      absenceType: e.absenceType ?? null,
      plannedMinutes: e.plannedMinutes,
    });
    entriesByEmployee.set(e.employeeId, list);
  }
  const uesAusweisMinutes = employees.reduce((acc, employee) => {
    const result = computeWeeklyBalance(
      week.year,
      week.weekNumber,
      entriesByEmployee.get(employee.id) ?? [],
      holidaysByLocation.get(employee.locationId) ?? buildHolidayLookup([]),
      {
        weeklyTargetMinutes: employee.weeklyTargetMinutes,
        hazMinutesPerWeek: employee.hazMinutesPerWeek,
        tztModel: employee.tztModel,
      },
    );
    return acc + result.weeklyUesAusweisMinutes;
  }, 0);

  const kpi: KpiSummary = {
    openRequests: openRequests.filter((r) => r.status === "OPEN").length,
    unassignedCells,
    activeEmployees: employees.length,
    uesAusweisMinutes,
    statusLabel: STATUS_LABEL[week.status],
  };

  const requestViews: RequestView[] = openRequests.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    startDate: isoDateString(r.startDate),
    endDate: isoDateString(r.endDate),
    rangeLabel: rangeLabel(r.startDate, r.endDate),
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    employeeId: r.employeeId,
    comment: r.comment,
  }));

  const serviceOptions: ServiceOption[] = services.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    breakMinutes: s.breakMinutes,
    comment: s.comment,
  }));

  // Pull a representative location label. If multiple, just use the first.
  const locationName = locations[0]?.name ?? "Standort";

  return (
    <PlanningBoard
      week={{
        id: week.id,
        year: week.year,
        weekNumber: week.weekNumber,
        status: week.status,
        publishedAt: week.publishedAt
          ? week.publishedAt.toISOString()
          : null,
        closedAt: week.closedAt ? week.closedAt.toISOString() : null,
      }}
      days={days.map((d) => ({
        iso: d.iso,
        weekdayLabel: d.weekdayLabel,
        shortDate: d.shortDate,
        longDate: d.longDate,
      }))}
      employees={employees.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        roleLabel: e.roleLabel,
      }))}
      entries={entries}
      services={serviceOptions}
      requests={requestViews}
      kpi={kpi}
      locationName={locationName}
    />
  );
}
