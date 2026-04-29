"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface RoleToggleProps {
  active: "admin" | "employee";
}

const tabBase =
  "inline-flex items-center justify-center rounded-full px-3 py-1.5 transition-colors";

export function RoleToggle({ active }: RoleToggleProps) {
  return (
    <div
      role="tablist"
      className="inline-flex rounded-full bg-neutral-100 p-1 text-xs font-medium"
    >
      {active === "admin" ? (
        <span
          role="tab"
          aria-selected
          className={cn(tabBase, "bg-neutral-900 text-white shadow-sm")}
        >
          Admin-Ansicht
        </span>
      ) : (
        <Link
          href="/dashboard"
          role="tab"
          aria-selected={false}
          className={cn(
            tabBase,
            "text-neutral-600 hover:text-neutral-900",
          )}
        >
          Admin-Ansicht
        </Link>
      )}
      {active === "employee" ? (
        <span
          role="tab"
          aria-selected
          className={cn(tabBase, "bg-neutral-900 text-white shadow-sm")}
        >
          Mitarbeiter-Ansicht
        </span>
      ) : (
        <Link
          href="/my-week"
          role="tab"
          aria-selected={false}
          className={cn(
            tabBase,
            "text-neutral-600 hover:text-neutral-900",
          )}
          title="Zur Mitarbeiter-Vorschau (Mitarbeiter:in wählen)"
        >
          Mitarbeiter-Ansicht
        </Link>
      )}
    </div>
  );
}
