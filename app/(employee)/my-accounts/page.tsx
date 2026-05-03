import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AccountsPanel } from "@/components/employee/accounts-panel";
import { BookingHistory } from "@/components/employee/booking-history";
import { loadMyAccounts } from "@/lib/employee/data";
import { loadBookingHistory } from "@/server/accounts";
import { AdminEmployeePreviewPicker } from "@/components/employee/admin-employee-preview-picker";
import { loadEmployeesForPreviewPicker } from "@/lib/employee/admin-preview-picker";

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
  if (!session.user.tenantId) redirect("/select-tenant");
  const tenantId = session.user.tenantId;

  const params = await searchParams;
  const year = pickYear(params.year);
  // Narrow params.employee into a string so the Prisma `where` cannot receive
  // `undefined` (which Prisma silently treats as "no filter" — a cross-employee
  // leak surface). After this, isAdminPreview ≡ previewEmployeeId !== null.
  const previewEmployeeId: string | null =
    session.user.role === "ADMIN" && params.employee
      ? params.employee
      : null;
  const isAdminPreview = previewEmployeeId !== null;

  if (session.user.role === "ADMIN" && !params.employee) {
    const employees = await loadEmployeesForPreviewPicker(tenantId);
    return (
      <AdminEmployeePreviewPicker
        title="Mitarbeiter:in für die Konten-Vorschau wählen"
        description="Du siehst die Konten der ausgewählten Person — nur zur Ansicht."
        employees={employees}
        route="/my-accounts"
        preserveParams={{ year: String(year) }}
      />
    );
  }

  const employee = await prisma.employee.findFirst({
    where:
      previewEmployeeId !== null
        ? { id: previewEmployeeId, tenantId, deletedAt: null }
        : { userId: session.user.id, tenantId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, roleLabel: true },
  });

  if (!employee) {
    if (isAdminPreview) {
      return (
        <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-neutral-900">
            Mitarbeiter:in nicht gefunden
          </h1>
          <p className="mx-auto max-w-md text-sm text-neutral-600">
            Die gewählte Person gehört nicht zu diesem Betrieb oder ist nicht
            mehr aktiv.
          </p>
        </section>
      );
    }
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
    loadMyAccounts({ tenantId }, employee.id, year),
    loadBookingHistory({ tenantId }, employee.id, { year }),
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
          <AccountsPanel
            accounts={accounts}
            title={isAdminPreview ? "Konten" : "Meine Konten"}
          />
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
          <BookingHistory
            rows={history}
            ferienBaseDailySollMinutes={accounts.ferien?.baseDailySollMinutes}
          />
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
