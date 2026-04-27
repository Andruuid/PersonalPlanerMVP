"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface AuditFilterProps {
  userId: string | "ALL";
  entity: string | "ALL";
  action: string | "ALL";
  fromIso: string;
  toIso: string;
  facets: {
    users: Array<{ id: string; email: string }>;
    entities: string[];
    actions: string[];
  };
}

const SELECT_CLASSES =
  "flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900";

export function AuditFilter({
  userId,
  entity,
  action,
  fromIso,
  toIso,
  facets,
}: AuditFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(patch: Record<string, string | undefined>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "ALL") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Reset to first page on any filter change (page is irrelevant after).
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function reset(): void {
    router.push(pathname);
  }

  const hasFilter =
    userId !== "ALL" ||
    entity !== "ALL" ||
    action !== "ALL" ||
    fromIso !== "" ||
    toIso !== "";

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Benutzer:in">
          <select
            value={userId}
            onChange={(e) => update({ user: e.target.value })}
            className={SELECT_CLASSES}
          >
            <option value="ALL">Alle Benutzer:innen</option>
            {facets.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Entität">
          <select
            value={entity}
            onChange={(e) => update({ entity: e.target.value })}
            className={SELECT_CLASSES}
          >
            <option value="ALL">Alle Entitäten</option>
            {facets.entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Aktion">
          <select
            value={action}
            onChange={(e) => update({ action: e.target.value })}
            className={SELECT_CLASSES}
          >
            <option value="ALL">Alle Aktionen</option>
            {facets.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Von">
          <input
            type="date"
            value={fromIso}
            onChange={(e) => update({ from: e.target.value })}
            className={SELECT_CLASSES}
          />
        </Field>
        <Field label="Bis">
          <input
            type="date"
            value={toIso}
            onChange={(e) => update({ to: e.target.value })}
            className={SELECT_CLASSES}
          />
        </Field>
      </div>

      {hasFilter ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={reset}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1 text-xs font-medium text-neutral-600">
      {label}
      {children}
    </label>
  );
}
