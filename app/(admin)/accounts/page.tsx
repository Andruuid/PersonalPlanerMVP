import Link from "next/link";
import { format } from "date-fns";
import { PageHeader } from "@/components/admin/page-header";
import { AccountsTable } from "@/components/admin/accounts/accounts-table";
import { YearEndButton } from "@/components/admin/accounts/year-end-button";
import { loadAdminAccountsTable } from "@/server/accounts";

export const metadata = { title: "Zeitkonten · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{ year?: string }>;
}

function pickYear(raw: string | undefined): number {
  const fallback = new Date().getFullYear();
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : fallback;
}

export default async function AccountsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const year = pickYear(raw.year);
  const rows = await loadAdminAccountsTable(year);
  const todayIso = format(new Date(), "yyyy-MM-dd");

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <PageHeader
        caption={`Konten · ${year}`}
        title="Zeitkonten"
        description="Zeitsaldo, Ferien, UEZ und TZT pro Mitarbeitenden. Werte ergeben sich aus AUTO_WEEKLY-Buchungen (Wochenabschluss) und manuellen Buchungen — alle audit-pflichtig."
        action={
          <div className="flex flex-wrap gap-2">
            <YearSwitcher year={year} currentYear={currentYear} />
            <YearEndButton defaultFromYear={year} />
          </div>
        }
      />

      <AccountsTable rows={rows} year={year} todayIso={todayIso} />
    </div>
  );
}

function YearSwitcher({ year, currentYear }: { year: number; currentYear: number }) {
  const years = [currentYear - 1, currentYear, currentYear + 1];
  return (
    <div className="inline-flex h-9 overflow-hidden rounded-md border border-neutral-300 bg-white text-sm shadow-sm">
      {years.map((y) => (
        <Link
          key={y}
          href={`/accounts?year=${y}`}
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
