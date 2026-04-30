import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/server/_shared";
import { isoDateString } from "@/lib/time/week";
import { LocationHolidaysEditor } from "@/components/admin/locations/location-holidays-editor";

type Confession = "EVANGELISCH" | "KATHOLISCH";

interface PageProps {
  params: Promise<{ id: string }>;
}

function normalizeConfession(regionCode: string): Confession {
  const normalized = regionCode.toUpperCase();
  if (
    normalized === "KATHOLISCH" ||
    normalized === "LU" ||
    normalized === "BE" ||
    normalized === "BS"
  ) {
    return "KATHOLISCH";
  }
  return "EVANGELISCH";
}

export default async function LocationHolidaysPage({ params }: PageProps) {
  const admin = await requireAdmin();
  const { id } = await params;

  const location = await prisma.location.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      tenantId: true,
      deletedAt: true,
      holidayRegionCode: true,
    },
  });
  if (!location || location.deletedAt || location.tenantId !== admin.tenantId) {
    notFound();
  }

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  const holidays = await prisma.holiday.findMany({
    where: {
      tenantId: admin.tenantId,
      locationId: location.id,
      date: {
        gte: new Date(Date.UTC(currentYear, 0, 1)),
        lt: new Date(Date.UTC(nextYear + 1, 0, 1)),
      },
    },
    orderBy: { date: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Standort"
        title={`Feiertage - ${location.name}`}
        description="CH-Standard vorschlagen, lokal anpassen und pro Jahr explizit speichern."
      />

      <Card>
        <CardHeader>
          <CardTitle>Feiertagsvorschlag und Override</CardTitle>
          <CardDescription>
            Standardvorschläge basieren auf der gewählten Konfession. Erst der
            Speichern-Button schreibt die Feiertage in den Standortkalender.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LocationHolidaysEditor
            locationId={location.id}
            locationName={location.name}
            defaultConfession={normalizeConfession(location.holidayRegionCode)}
            initialYear={currentYear}
            initialExistingHolidays={holidays.map((h) => ({
              date: isoDateString(h.date),
              name: h.name,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
