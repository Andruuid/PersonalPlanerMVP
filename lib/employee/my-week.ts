import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { isoWeekDays, startOfIsoWeek } from "@/lib/time/week";
import {
  shiftKeyForAbsence,
  shiftKeyForServiceCode,
  type ShiftKey,
} from "@/lib/shift-style";
import type { WeekSnapshot } from "@/server/weeks";
import type { MyDayView, MyWeekHeader } from "@/components/employee/types";
import type { SessionUser } from "@/server/_shared";
import {
  computeWeeklyBalance,
  type PlanEntryByDate,
} from "@/lib/time/balance";
import { buildHolidayLookup } from "@/lib/time/holidays";
import type { AbsenceType } from "@/lib/time/priority";
import { effectiveStandardWorkDays } from "@/lib/time/soll";
import {
  freeRequestedZeitsaldoTooltip,
  holidayMapToLookupInput,
} from "@/lib/time/contribution-display";

const ABSENCE_LABEL: Record<string, string> = {
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

interface SnapshotEntry {
  date: string;
  employeeId: string;
  kind: string;
  serviceCode: string | null;
  serviceName: string | null;
  startTime: string | null;
  endTime: string | null;
  /** Ab Publish; neues Feld */
  serviceBlockColorHex?: string | null;
  /** Legacy Snapshots (früher chip) */
  serviceChipColorHex?: string | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeLabel: string | null;
  absenceType: string | null;
  plannedMinutes?: number;
  comment: string | null;
}

export interface MyWeekResult {
  header: MyWeekHeader;
  days: MyDayView[];
}

interface ResolveOptions {
  year?: number;
  weekNumber?: number;
}

function snapshotEntryToPlanEntry(entry: SnapshotEntry): PlanEntryByDate {
  const kind = entry.kind as PlanEntryByDate["kind"];
  let shiftStartTime: string | null | undefined;
  let shiftEndTime: string | null | undefined;
  if (kind === "SHIFT") {
    shiftStartTime = entry.startTime;
    shiftEndTime = entry.endTime;
  } else if (kind === "ONE_TIME_SHIFT") {
    shiftStartTime = entry.oneTimeStart;
    shiftEndTime = entry.oneTimeEnd;
  }
  return {
    date: entry.date,
    kind,
    absenceType: (entry.absenceType as AbsenceType | null) ?? null,
    plannedMinutes: entry.plannedMinutes ?? 0,
    shiftStartTime,
    shiftEndTime,
  };
}

/**
 * Picks the week to render for the employee:
 *  1. If year+week are given via the URL, use that.
 *  2. Otherwise, use the current ISO week.
 *
 * The page reads only PublishedSnapshot so reset-to-draft preserves the view.
 * Feiertage: mit `snapshot.holidays` pro Standort eingefroren (Publish/Republish);
 * ohne dieses Feld (ältere Snapshots) oder ohne PublishedSnapshot → live prisma.holiday.
 */
export async function loadMyWeek(
  user: Pick<SessionUser, "tenantId">,
  employeeId: string,
  locationId: string,
  current: { year: number; weekNumber: number },
  options: ResolveOptions = {},
): Promise<MyWeekResult> {
  const year = options.year ?? current.year;
  const weekNumber = options.weekNumber ?? current.weekNumber;

  const [week, employeeRow] = await Promise.all([
    prisma.week.findFirst({
      where: { tenantId: user.tenantId, year, weekNumber, deletedAt: null },
      include: {
        snapshots: {
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.employee.findUnique({
      where: {
        id: employeeId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: {
        weeklyTargetMinutes: true,
        hazMinutesPerWeek: true,
        tztModel: true,
        standardWorkDays: true,
        tenant: { select: { defaultStandardWorkDays: true } },
      },
    }),
  ]);

  const snapshot: WeekSnapshot | null = week?.snapshots[0]
    ? (JSON.parse(week.snapshots[0].snapshotJson) as WeekSnapshot)
    : null;

  const days = isoWeekDays(year, weekNumber);

  const holidayByIso = new Map<string, string>();
  if (snapshot?.holidays) {
    for (const h of snapshot.holidays[locationId] ?? []) {
      holidayByIso.set(h.iso, h.name);
    }
  } else {
    const startDate = startOfIsoWeek(year, weekNumber);
    const endDate = days[6].date;
    const holidayRows = await prisma.holiday.findMany({
      where: {
        tenantId: user.tenantId,
        locationId,
        date: { gte: startDate, lte: endDate },
      },
    });
    for (const h of holidayRows) {
      holidayByIso.set(format(h.date, "yyyy-MM-dd"), h.name);
    }
  }

  const entriesByDate = new Map<string, SnapshotEntry>();
  if (snapshot) {
    for (const entry of snapshot.entries) {
      if (entry.employeeId === employeeId) {
        entriesByDate.set(entry.date, entry as SnapshotEntry);
      }
    }
  }

  const displayByIso = new Map<string, number>();
  if (snapshot && employeeRow) {
    const balanceEntries = snapshot.entries
      .filter((e) => e.employeeId === employeeId)
      .map((e) => snapshotEntryToPlanEntry(e as SnapshotEntry));
    const holidayLookup = buildHolidayLookup(holidayMapToLookupInput(holidayByIso));
    const balance = computeWeeklyBalance(
      year,
      weekNumber,
      balanceEntries,
      holidayLookup,
      {
        weeklyTargetMinutes: employeeRow.weeklyTargetMinutes,
        hazMinutesPerWeek: employeeRow.hazMinutesPerWeek,
        tztModel: employeeRow.tztModel,
        standardWorkDays: effectiveStandardWorkDays(
          employeeRow.standardWorkDays,
          employeeRow.tenant.defaultStandardWorkDays,
        ),
      },
    );
    for (const d of balance.days) {
      displayByIso.set(d.iso, d.displayContributionMinutes);
    }
  }

  const freeRequestedTooltipText = freeRequestedZeitsaldoTooltip(
    year,
    weekNumber,
  );

  const myDays: MyDayView[] = days.map((day, index) => {
    const isWeekend = index >= 5;
    const holidayName = holidayByIso.get(day.iso) ?? null;
    const entry = entriesByDate.get(day.iso) ?? null;
    const displayContributionMinutes = snapshot && employeeRow
      ? (displayByIso.get(day.iso) ?? 0)
      : null;
    return buildDayView({
      day,
      isWeekend,
      holidayName,
      entry,
      displayContributionMinutes,
      freeRequestedTooltipText,
    });
  });

  const header: MyWeekHeader = {
    year,
    weekNumber,
    status: (week?.status ?? "DRAFT") as MyWeekHeader["status"],
    publishedAt:
      week?.snapshots[0]?.publishedAt
        ? new Date(week.snapshots[0].publishedAt).toISOString()
        : null,
    hasSnapshot: snapshot !== null,
  };

  return { header, days: myDays };
}

interface BuildDayInput {
  day: { iso: string; longDate: string; shortDate: string; weekdayLabel: string };
  isWeekend: boolean;
  holidayName: string | null;
  entry: SnapshotEntry | null;
  displayContributionMinutes: number | null;
  freeRequestedTooltipText: string;
}

function buildDayView({
  day,
  isWeekend,
  holidayName,
  entry,
  displayContributionMinutes,
  freeRequestedTooltipText,
}: BuildDayInput): MyDayView {
  let shiftKey: ShiftKey = "EMPTY";
  let title = "Frei";
  let timeRange: string | null = null;
  let subtitle: string | null = null;
  let serviceBlockColorHex: string | null = null;

  if (entry) {
    if (entry.kind === "SHIFT") {
      shiftKey = shiftKeyForServiceCode(entry.serviceCode ?? undefined);
      title = entry.serviceName ?? "Dienst";
      serviceBlockColorHex =
        entry.serviceBlockColorHex ?? entry.serviceChipColorHex ?? null;
      if (entry.startTime && entry.endTime) {
        timeRange = `${entry.startTime} – ${entry.endTime}`;
      }
      subtitle = entry.comment ?? null;
    } else if (entry.kind === "ONE_TIME_SHIFT") {
      shiftKey = "FRUEH";
      title = entry.oneTimeLabel ?? "Einmal-Dienst";
      if (entry.oneTimeStart && entry.oneTimeEnd) {
        timeRange = `${entry.oneTimeStart} – ${entry.oneTimeEnd}`;
      }
      subtitle = entry.comment ?? null;
    } else if (entry.kind === "VFT") {
      shiftKey = "FREI";
      title = "VFT";
      subtitle = entry.comment ?? "Verschobener freier Tag";
    } else if (entry.kind === "ABSENCE" && entry.absenceType) {
      shiftKey = shiftKeyForAbsence(entry.absenceType);
      title = ABSENCE_LABEL[entry.absenceType] ?? "Abwesenheit";
      subtitle = entry.comment ?? null;
    }
  } else if (holidayName) {
    shiftKey = "FEIERTAG";
    title = "Feiertag";
    subtitle = holidayName;
  } else {
    shiftKey = isWeekend ? "FREI" : "EMPTY";
    title = "Frei";
  }

  const freeRequestedZeitsaldoTooltip =
    shiftKey === "FREI_VERLANGT" ? freeRequestedTooltipText : null;

  return {
    iso: day.iso,
    longDate: day.longDate,
    shortDate: day.shortDate,
    weekdayLabel: day.weekdayLabel,
    isWeekend,
    holidayName,
    shiftKey,
    serviceBlockColorHex,
    title,
    timeRange,
    subtitle,
    displayContributionMinutes,
    freeRequestedZeitsaldoTooltip,
  };
}
