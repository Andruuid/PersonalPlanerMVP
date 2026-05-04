import { format, parse as parseFns, addDays } from "date-fns";
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
import {
  computeWeeklyBalance,
  type PlanEntryByDate,
  type WeeklyComputation,
} from "@/lib/time/balance";
import { effectiveStandardWorkDays } from "@/lib/time/soll";
import type { AbsenceType, WeekendWorkClassification } from "@/lib/time/priority";
import { buildHolidayLookup } from "@/lib/time/holidays";
import { requireAdmin } from "@/server/_shared";
import {
  hasCoverageRequirement,
  isUnderstaffed,
} from "@/lib/services/coverage";

export const metadata = { title: "Wochenplanung · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{ year?: string; week?: string }>;
}

const STATUS_LABEL: Record<WeekView["status"], string> = {
  DRAFT: "Entwurf",
  REOPENED: "Wieder geöffnet",
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
    blockColorHex: string | null;
  } | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeBreakMinutes: number | null;
  oneTimeLabel: string | null;
  absenceType: string | null;
  weekendWorkClassification: string | null;
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
  } else if (raw.kind === "HALF_DAY_OFF") {
    shiftKey = "FREI";
    title = "Freier Halbtag";
  } else if (raw.kind === "ABSENCE" && raw.absenceType) {
    shiftKey = shiftKeyForAbsence(raw.absenceType);
    const labelMap: Record<string, string> = {
      VACATION: "Ferien",
      SICK: "Krank",
      ACCIDENT: "Unfall",
      FREE_REQUESTED: "Freier Tag (Zeitsaldo)",
      UEZ_BEZUG: "UEZ-Bezug",
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
    weekendWorkClassification:
      (raw.weekendWorkClassification as WeekendWorkClassification | null) ?? null,
    shiftKey,
    serviceBlockColorHex:
      raw.kind === "SHIFT" && raw.serviceTemplate
        ? raw.serviceTemplate.blockColorHex ?? null
        : null,
    title,
    subtitle: null,
  };
  view.subtitle = buildSubtitle(view);
  return view;
}

function fmtGapMinutesRest(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}min`;
}

function formatRestViolationTooltip(c: WeeklyComputation): string | null {
  const lines: string[] = [];
  for (const v of c.dailyRestViolations) {
    const ddmm = parseFns(v.date, "yyyy-MM-dd", new Date());
    const dl = Number.isNaN(ddmm.getTime())
      ? v.date
      : format(ddmm, "dd.MM.");
    lines.push(
      `Tägliche Ruhezeit: am ${dl} nur ${fmtGapMinutesRest(v.gapMinutes)} zwischen den Schichten (mind. 11h).`,
    );
  }
  if (!c.weeklyRestOk) {
    lines.push(
      `Wöchentliche Ruhezeit: längste zusammenhängende Ruhe ${fmtGapMinutesRest(c.weeklyRestLongestGapMinutes)} (mind. 35h).`,
    );
  }
  return lines.length ? lines.join("\n") : null;
}

function formatLaborComplianceTooltip(
  c: WeeklyComputation,
  kwIsos: Set<string>,
): string | null {
  const streakInKw = c.consecutiveWorkDayViolations.filter((iso) =>
    kwIsos.has(iso),
  );
  const lines: string[] = [];
  if (streakInKw.length > 0) {
    lines.push(
      `Mehr als 6 Arbeitstage in Folge (betrifft Datum: ${streakInKw.join(", ")}).`,
    );
  }
  if (c.halfDayOffMissing) {
    lines.push(
      "Pflicht: freier Halbtag nicht geplant (> 5 Arbeitstage mit Verteilung in der Woche).",
    );
  }
  return lines.length ? lines.join("\n") : null;
}

function planEntryToBalanceRow(e: {
  date: Date;
  kind: string;
  absenceType: string | null;
  plannedMinutes: number;
  serviceTemplate: {
    startTime: string;
    endTime: string;
  } | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  weekendWorkClassification: string | null;
}): PlanEntryByDate {
  const shiftStartTime =
    e.kind === "SHIFT" && e.serviceTemplate
      ? e.serviceTemplate.startTime
      : e.kind === "ONE_TIME_SHIFT"
        ? e.oneTimeStart
        : null;
  const shiftEndTime =
    e.kind === "SHIFT" && e.serviceTemplate
      ? e.serviceTemplate.endTime
      : e.kind === "ONE_TIME_SHIFT"
        ? e.oneTimeEnd
        : null;
  return {
    date: isoDateString(e.date),
    kind: e.kind as PlanEntryByDate["kind"],
    absenceType: (e.absenceType as AbsenceType | null | undefined) ?? null,
    plannedMinutes: e.plannedMinutes,
    weekendWorkClassification:
      (e.weekendWorkClassification as WeekendWorkClassification | null) ?? null,
    shiftStartTime,
    shiftEndTime,
  };
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

  const [employees, services, planEntries, openRequests, openRequestsCount, locations] =
    await Promise.all([
      prisma.employee.findMany({
        where: { tenantId: admin.tenantId, isActive: true, deletedAt: null },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          location: { select: { name: true } },
          tenant: { select: { defaultStandardWorkDays: true } },
        },
      }),
      prisma.serviceTemplate.findMany({
        where: {
          tenantId: admin.tenantId,
          isActive: true,
          deletedAt: null,
        },
        orderBy: { name: "asc" },
      }),
      // PlanEntry has no tenantId column; scoped via employee relation.
      // eslint-disable-next-line tenant/require-tenant-scope
      prisma.planEntry.findMany({
        where: {
          weekId: week.id,
          deletedAt: null,
          employee: { tenantId: admin.tenantId, deletedAt: null },
        },
        include: {
          serviceTemplate: {
            select: {
              code: true,
              name: true,
              startTime: true,
              endTime: true,
              breakMinutes: true,
              comment: true,
              blockColorHex: true,
            },
          },
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.absenceRequest.findMany({
        where: {
          tenantId: admin.tenantId,
          deletedAt: null,
          status: "OPEN",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.absenceRequest.count({
        where: {
          tenantId: admin.tenantId,
          deletedAt: null,
          status: "OPEN",
        },
      }),
      prisma.location.findMany({
        where: { tenantId: admin.tenantId, deletedAt: null },
        orderBy: { name: "asc" },
        take: 1,
      }),
    ]);

  // PlanEntry has no tenantId column; scoped via employee relation.
  // eslint-disable-next-line tenant/require-tenant-scope
  const streakPrefetchPlanEntries = await prisma.planEntry.findMany({
    where: {
      deletedAt: null,
      date: {
        gte: addDays(startDate, -14),
        lt: startDate,
      },
      employee: { tenantId: admin.tenantId, deletedAt: null },
    },
    include: {
      serviceTemplate: {
        select: {
          code: true,
          name: true,
          startTime: true,
          endTime: true,
          breakMinutes: true,
          comment: true,
          blockColorHex: true,
        },
      },
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  const streakPrefetchByEmp = new Map<string, PlanEntryByDate[]>();
  for (const e of streakPrefetchPlanEntries) {
    const row = planEntryToBalanceRow(e);
    const list = streakPrefetchByEmp.get(e.employeeId) ?? [];
    list.push(row);
    streakPrefetchByEmp.set(e.employeeId, list);
  }

  const kwIsoDates = new Set(days.map((d) => d.iso));

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
      weekendWorkClassification: e.weekendWorkClassification,
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
    list.push(planEntryToBalanceRow(e));
    entriesByEmployee.set(e.employeeId, list);
  }

  const streakFullContextByEmp: Record<string, PlanEntryByDate[]> = {};
  const holidayIsosForEmployee: Record<string, string[]> = {};
  for (const emp of employees) {
    streakFullContextByEmp[emp.id] = [
      ...(streakPrefetchByEmp.get(emp.id) ?? []),
      ...(entriesByEmployee.get(emp.id) ?? []),
    ];
    holidayIsosForEmployee[emp.id] = holidays
      .filter((h) => h.locationId === emp.locationId)
      .map((h) => isoDateString(h.date));
  }

  const planningByEmployee = new Map<
    string,
    { tooltip: string | null; hasPlanningViolations: boolean }
  >();
  const dailyZeitBalanceByEmployee: Record<string, Record<string, number>> =
    {};
  let restViolationCount = 0;
  let consecutiveWorkStreakKwViolationCount = 0;
  let halfDayOffMissingEmployees = 0;
  for (const employee of employees) {
    const result = computeWeeklyBalance(
      week.year,
      week.weekNumber,
      entriesByEmployee.get(employee.id) ?? [],
      holidaysByLocation.get(employee.locationId) ?? buildHolidayLookup([]),
      {
        weeklyTargetMinutes: employee.weeklyTargetMinutes,
        hazMinutesPerWeek: employee.hazMinutesPerWeek,
        tztModel: employee.tztModel,
        standardWorkDays: effectiveStandardWorkDays(
          employee.standardWorkDays,
          employee.tenant.defaultStandardWorkDays,
        ),
      },
      streakPrefetchByEmp.get(employee.id) ?? [],
    );
    restViolationCount +=
      result.dailyRestViolations.length + (result.weeklyRestOk ? 0 : 1);
    const restPart = formatRestViolationTooltip(result);
    const laborPart = formatLaborComplianceTooltip(result, kwIsoDates);
    const tooltip = [restPart, laborPart].filter(Boolean).join("\n\n") || null;
    const hasRest =
      result.dailyRestViolations.length > 0 || !result.weeklyRestOk;
    const hasLabor = laborPart !== null;
    const hasPlanningViolations = hasRest || hasLabor;
    planningByEmployee.set(employee.id, {
      tooltip,
      hasPlanningViolations,
    });
    consecutiveWorkStreakKwViolationCount +=
      result.consecutiveWorkDayViolations.filter((iso) =>
        kwIsoDates.has(iso),
      ).length;
    if (result.halfDayOffMissing) halfDayOffMissingEmployees += 1;

    const byIso: Record<string, number> = {};
    for (const d of result.days) {
      byIso[d.iso] = d.displayContributionMinutes;
    }
    dailyZeitBalanceByEmployee[employee.id] = byIso;
  }

  // Coverage analysis: compare ServiceTemplate.requiredCount per weekday flagged
  // by `defaultDays` against the planned SHIFT entries for that template + day.
  const shiftCounts = new Map<string, number>();
  for (const e of planEntries) {
    if (e.kind !== "SHIFT" || !e.serviceTemplateId) continue;
    const key = `${isoDateString(e.date)}__${e.serviceTemplateId}`;
    shiftCounts.set(key, (shiftCounts.get(key) ?? 0) + 1);
  }

  const understaffedDays = new Set<string>();
  let understaffedSlots = 0;
  let understaffedRequired = 0;
  let understaffedPlanned = 0;
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    for (const template of services) {
      if (!hasCoverageRequirement(template, i)) continue;
      const planned = shiftCounts.get(`${day.iso}__${template.id}`) ?? 0;
      if (isUnderstaffed(template, i, planned)) {
        understaffedSlots += 1;
        understaffedRequired += template.requiredCount ?? 0;
        understaffedPlanned += planned;
        understaffedDays.add(day.iso);
      }
    }
  }

  const kpi: KpiSummary = {
    openRequests: openRequestsCount,
    unassignedCells,
    activeEmployees: employees.length,
    understaffedSlots,
    understaffedRequired,
    understaffedPlanned,
    statusLabel: STATUS_LABEL[week.status],
    restViolationCount,
    consecutiveWorkStreakKwViolationCount,
    halfDayOffMissingEmployees,
  };

  const requestViews: RequestView[] = openRequests.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status as RequestView["status"],
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
    blockColorHex: s.blockColorHex,
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
        understaffed: understaffedDays.has(d.iso),
      }))}
      employees={employees.map((e) => {
        const pv = planningByEmployee.get(e.id);
        return {
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          roleLabel: e.roleLabel,
          planningViolationTooltip: pv?.tooltip ?? null,
          hasPlanningViolations: pv?.hasPlanningViolations ?? false,
        };
      })}
      entries={entries}
      services={serviceOptions}
      requests={requestViews}
      kpi={kpi}
      locationName={locationName}
      weekYear={week.year}
      weekNumber={week.weekNumber}
      streakContextsByEmployee={streakFullContextByEmp}
      holidayIsosForEmployee={holidayIsosForEmployee}
      dailyZeitBalanceByEmployee={dailyZeitBalanceByEmployee}
    />
  );
}
