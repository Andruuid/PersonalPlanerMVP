import Link from "next/link";
import type { AdminPreviewPickerEmployee } from "@/lib/employee/admin-preview-picker";
import { previewEmployeeLabel } from "@/lib/employee/admin-preview-picker";

type Route = "/my-week" | "/my-accounts" | "/my-requests";

interface Props {
  title: string;
  description: string;
  employees: AdminPreviewPickerEmployee[];
  route: Route;
  /** Extra query params preserved when opening preview (e.g. year, week). */
  preserveParams?: Record<string, string | undefined>;
}

export function AdminEmployeePreviewPicker({
  title,
  description,
  employees,
  route,
  preserveParams,
}: Props) {
  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(preserveParams ?? {})) {
    if (value !== undefined && value !== "") base.set(key, value);
  }
  const baseStr = base.toString();

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <header className="space-y-2 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Mitarbeiter-Ansicht (Vorschau)
        </p>
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        <p className="mx-auto max-w-md text-sm text-neutral-600">{description}</p>
      </header>
      {employees.length === 0 ? (
        <p className="text-center text-sm text-neutral-600">
          Für diesen Betrieb sind keine aktiven Mitarbeitenden hinterlegt.
        </p>
      ) : (
        <ul className="mx-auto max-w-lg divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {employees.map((e) => {
            const q = new URLSearchParams(baseStr);
            q.set("employee", e.id);
            return (
              <li key={e.id}>
                <Link
                  href={`${route}?${q.toString()}`}
                  className="block px-4 py-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
                >
                  {previewEmployeeLabel(e)}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
