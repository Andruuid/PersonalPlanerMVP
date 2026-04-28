import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AccountsPanel } from "@/components/employee/accounts-panel";
import { BookingHistory } from "@/components/employee/booking-history";
import { loadMyAccounts } from "@/lib/employee/data";
import { loadBookingHistory } from "@/server/accounts";

export const metadata = { title: "Meine Konten · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{ year?: string; employee?: string }>;
}

function pickYear(raw: string | undefined): number {
  const fallback = new Date().getFullYear();
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : fallback;
}

export default async function MyAccountsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const year = pickYear(params.year);
  const isAdminPreview =
    session.user.role === "ADMIN" && Boolean(params.employee);

  const employee = await prisma.employee.findFirst({
    where: isAdminPreview
      ? { id: params.employee, tenantId: session.user.tenantId, deletedAt: null }
      : { userId: session.user.id, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, roleLabel: true },
  });

  if (!employee) {
    return (
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">
          Kein Mitarbeitenden-Profil verknüpft
        </h1>
        <p className="mx-auto max-w-md text-sm text-neutral-600">
          Bitte wende dich an die Geschäftsleitung — dein Login ist nicht mit
          einem Mitarbeitenden-Profil verknüpft.
        </p>
      </section>
    );
  }

  const [accounts, history] = await Promise.all([
    loadMyAccounts(session.user, employee.id, year),
    loadBookingHistory(session.user, employee.id, { year }),
  ]);

  const currentYear = new Date().getFullYear();
  const previewQuery = isAdminPreview ? `&employee=${employee.id}` : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Konten · {year}
          </p>
          <h1 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
            {isAdminPreview
              ? `Konten von ${employee.firstName} ${employee.lastName}`
              : "Meine Konten"}
          </h1>
          <p className="max-w-2xl text-sm text-neutral-600">
            Aktueller Stand und Buchungs-Historie pro Monat. Zeitsaldo, Ferien
            und TZT werden nach jedem Wochenabschluss automatisch fortgeschrieben.
          </p>
        </div>
        <YearSwitcher
          year={year}
          currentYear={currentYear}
          previewQuery={previewQuery}
        />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-4">
          <AccountsPanel accounts={accounts} />
        </aside>

        <section className="space-y-4">
          <header>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Buchungs-Historie
            </h2>
            <p className="text-xs text-neutral-500">
              Alle Buchungen für {year}, gruppiert nach Monat.
            </p>
          </header>
          <BookingHistory rows={history} />
        </section>
      </div>
    </div>
  );
}

function YearSwitcher({
  year,
  currentYear,
  previewQuery,
}: {
  year: number;
  currentYear: number;
  previewQuery: string;
}) {
  const years = [currentYear - 1, currentYear, currentYear + 1];
  return (
    <div className="inline-flex h-9 overflow-hidden rounded-md border border-neutral-300 bg-white text-sm shadow-sm">
      {years.map((y) => (
        <Link
          key={y}
          href={`/my-accounts?year=${y}${previewQuery}`}
          className={
            "inline-flex h-full items-center px-3 transition " +
            (y === year
              ? "bg-neutral-900 text-white"
              : "text-neutral-700 hover:bg-neutral-50")
          }
        >
          {y}
        </Link>
      ))}
    </div>
  );
}
