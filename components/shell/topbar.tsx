"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./sidebar";
import { RoleToggle } from "./role-toggle";
import { UserMenu } from "./user-menu";
import { AdminPreviewEmployeeBadge } from "./admin-preview-employee-badge";

interface TopbarProps {
  variant: "admin" | "employee";
  email: string;
  canSwitchTenant: boolean;
  showRoleToggle: boolean;
  adminHeadingName?: string | null;
  /** Vor- und Nachname; nur in der Mitarbeiter-Ansicht als Kopfzeile nach «Personalplanung –». */
  employeeHeadingName?: string | null;
}

/** Admin-Vorschau: Layout hat kein searchParams — Namen per API nachziehen. */
function PreviewEmployeeHeadingGate({ showRoleToggle }: { showRoleToggle: boolean }) {
  const searchParams = useSearchParams();
  const previewId = searchParams.get("employee")?.trim();
  if (!showRoleToggle || !previewId) {
    return <>Personalplanung – Mitarbeiter</>;
  }
  return (
    <PreviewEmployeeHeadingLoaded key={previewId} employeeId={previewId} />
  );
}

function PreviewEmployeeHeadingLoaded({ employeeId }: { employeeId: string }) {
  const [previewName, setPreviewName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/admin/preview-employee-heading?employeeId=${encodeURIComponent(employeeId)}`,
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ heading?: string | null }>) : null))
      .then((data) => {
        if (!cancelled && data?.heading?.trim()) {
          setPreviewName(data.heading.trim());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const suffix = previewName?.trim() ?? "Mitarbeiter";
  return <>Personalplanung – {suffix}</>;
}

export function Topbar({
  variant,
  email,
  canSwitchTenant,
  showRoleToggle,
  adminHeadingName,
  employeeHeadingName,
}: TopbarProps) {
  const employeeTitle =
    variant === "employee" ? (
      employeeHeadingName?.trim() ? (
        `Personalplanung – ${employeeHeadingName.trim()}`
      ) : (
        <Suspense fallback={<>Personalplanung – Mitarbeiter</>}>
          <PreviewEmployeeHeadingGate showRoleToggle={showRoleToggle} />
        </Suspense>
      )
    ) : null;

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full items-center gap-3 px-4 py-3 md:px-6">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Navigation öffnen"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar variant={variant} className="border-r-0" />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Prototyp
          </span>
          <h1 className="truncate text-base font-semibold text-neutral-900 md:text-lg">
            {variant === "admin"
              ? `Personalplanung – ${adminHeadingName?.trim() || "Admin"}`
              : employeeTitle}
          </h1>
        </div>

        {showRoleToggle ? (
          <div className="hidden items-center gap-2 md:flex">
            <RoleToggle active={variant} />
            {variant === "employee" ? (
              <Suspense fallback={null}>
                <AdminPreviewEmployeeBadge />
              </Suspense>
            ) : null}
          </div>
        ) : null}

        <UserMenu email={email} canSwitchTenant={canSwitchTenant} />
      </div>

      {showRoleToggle ? (
        <div className="flex items-center justify-end border-t border-neutral-100 px-4 py-2 md:hidden">
          <RoleToggle active={variant} />
        </div>
      ) : null}
    </header>
  );
}
