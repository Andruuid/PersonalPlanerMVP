import { prisma } from "@/lib/db";
import { requireAdmin } from "@/server/_shared";
import { isoDateString } from "@/lib/time/week";
import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LocationsCard,
  type LocationRow,
} from "@/components/admin/settings/locations-card";
import { HolidaysFilter } from "@/components/admin/settings/holidays-filter";
import { HolidayAddForm } from "@/components/admin/settings/holiday-add-form";
import {
  HolidaysList,
  type HolidayRow,
} from "@/components/admin/settings/holidays-list";

export const metadata = { title: "Einstellungen · PersonalPlaner" };

const WEEKDAYS_DE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

interface PageProps {
  searchParams: Promise<{ locationId?: string; year?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const params = await searchParams;

  const locations = await prisma.location.findMany({
    where: { tenantId: admin.tenantId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { employees: true, holidays: true } },
    },
  });

  const fallbackLocationId = locations[0]?.id ?? "";
  const selectedLocationId =
    params.locationId && locations.some((l) => l.id === params.locationId)
      ? params.locationId
      : fallbackLocationId;
  const yearParam = Number(params.year);
  const selectedYear =
    Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? Math.trunc(yearParam)
      : new Date().getFullYear();

  const locationRows: LocationRow[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    holidayRegionCode: l.holidayRegionCode,
    employeeCount: l._count.employees,
    holidayCount: l._count.holidays,
  }));

  const holidayRows: HolidayRow[] = [];
  if (selectedLocationId) {
    const yearStart = new Date(Date.UTC(selectedYear, 0, 1));
    const yearEnd = new Date(Date.UTC(selectedYear + 1, 0, 1));
    const holidays = await prisma.holiday.findMany({
      where: {
        tenantId: admin.tenantId,
        locationId: selectedLocationId,
        date: { gte: yearStart, lt: yearEnd },
      },
      orderBy: { date: "asc" },
    });
    for (const h of holidays) {
      holidayRows.push({
        id: h.id,
        date: isoDateString(h.date),
        name: h.name,
        weekday: WEEKDAYS_DE[h.date.getDay()],
      });
    }
  }

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Konfiguration"
        title="Einstellungen"
        description="Standorte und Feiertagskalender pflegen. Feiertage steuern die Sollzeit-Berechnung pro Standort."
      />

      <LocationsCard locations={locationRows} />

      <Card>
        <CardHeader>
          <CardTitle>Feiertage</CardTitle>
          <CardDescription>
            Feiertage pro Standort und Jahr verwalten. „Generieren“ legt das
            CH-/Kantonsmuster für das gewählte Jahr automatisch an.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <HolidaysFilter
            locations={locations.map((l) => ({
              id: l.id,
              name: l.name,
              holidayRegionCode: l.holidayRegionCode,
            }))}
            selectedLocationId={selectedLocationId}
            selectedYear={selectedYear}
          />

          {selectedLocation ? (
            <>
              <HolidayAddForm
                locationId={selectedLocation.id}
                defaultYear={selectedYear}
              />
              <HolidaysList
                holidays={holidayRows}
                locationId={selectedLocation.id}
                year={selectedYear}
                region={selectedLocation.holidayRegionCode}
              />
            </>
          ) : (
            <p className="text-sm text-neutral-500">
              Lege zuerst einen Standort an, um Feiertage zu verwalten.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
