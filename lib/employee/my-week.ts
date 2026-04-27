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

const ABSENCE_LABEL: Record<string, string> = {
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

interface SnapshotEntry {
  date: string;
  employeeId: string;
  kind: string;
  serviceCode: string | null;
  serviceName: string | null;
  startTime: string | null;
  endTime: string | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeLabel: string | null;
  absenceType: string | null;
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

/**
 * Picks the week to render for the employee:
 *  1. If year+week are given via the URL, use that.
 *  2. Otherwise, use the current ISO week.
 *
 * The page reads only PublishedSnapshot so reset-to-draft preserves the view.
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

  const week = await prisma.week.findUnique({
    where: { tenantId_year_weekNumber: { tenantId: user.tenantId, year, weekNumber } },
    include: {
      snapshots: {
        orderBy: { publishedAt: "desc" },
        take: 1,
      },
    },
  });

  const snapshot: WeekSnapshot | null = week?.snapshots[0]
    ? (JSON.parse(week.snapshots[0].snapshotJson) as WeekSnapshot)
    : null;

  const days = isoWeekDays(year, weekNumber);
  const startDate = startOfIsoWeek(year, weekNumber);
  const endDate = days[6].date;

  const holidayRows = await prisma.holiday.findMany({
    where: {
      tenantId: user.tenantId,
      locationId,
      date: { gte: startDate, lte: endDate },
    },
  });
  const holidayByIso = new Map<string, string>();
  for (const h of holidayRows) {
    holidayByIso.set(format(h.date, "yyyy-MM-dd"), h.name);
  }

  const entriesByDate = new Map<string, SnapshotEntry>();
  if (snapshot) {
    for (const entry of snapshot.entries) {
      if (entry.employeeId === employeeId) {
        entriesByDate.set(entry.date, entry as SnapshotEntry);
      }
    }
  }

  const myDays: MyDayView[] = days.map((day, index) => {
    const isWeekend = index >= 5;
    const holidayName = holidayByIso.get(day.iso) ?? null;
    const entry = entriesByDate.get(day.iso) ?? null;
    return buildDayView({ day, isWeekend, holidayName, entry });
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
}

function buildDayView({
  day,
  isWeekend,
  holidayName,
  entry,
}: BuildDayInput): MyDayView {
  let shiftKey: ShiftKey = "EMPTY";
  let title = "Frei";
  let timeRange: string | null = null;
  let subtitle: string | null = null;

  if (entry) {
    if (entry.kind === "SHIFT") {
      shiftKey = shiftKeyForServiceCode(entry.serviceCode ?? undefined);
      title = entry.serviceName ?? "Dienst";
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

  return {
    iso: day.iso,
    longDate: day.longDate,
    shortDate: day.shortDate,
    weekdayLabel: day.weekdayLabel,
    isWeekend,
    holidayName,
    shiftKey,
    title,
    timeRange,
    subtitle,
  };
}
