"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface RoleToggleProps {
  active: "admin" | "employee";
}

export function RoleToggle({ active }: RoleToggleProps) {
  const router = useRouter();

  const switchTo = (target: "admin" | "employee") => {
    if (target === active) return;
    router.push(target === "admin" ? "/dashboard" : "/my-week");
  };

  return (
    <div
      role="tablist"
      className="inline-flex rounded-full bg-neutral-100 p-1 text-xs font-medium"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === "admin"}
        onClick={() => switchTo("admin")}
        className={cn(
          "rounded-full px-3 py-1.5 transition-colors",
          active === "admin"
            ? "bg-neutral-900 text-white shadow-sm"
            : "text-neutral-600 hover:text-neutral-900",
        )}
      >
        Admin-Ansicht
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "employee"}
        onClick={() => switchTo("employee")}
        className={cn(
          "rounded-full px-3 py-1.5 transition-colors",
          active === "employee"
            ? "bg-neutral-900 text-white shadow-sm"
            : "text-neutral-600 hover:text-neutral-900",
        )}
      >
        Mitarbeiter-Ansicht
      </button>
    </div>
  );
}
