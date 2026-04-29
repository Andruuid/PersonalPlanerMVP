"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ADMIN_NAV,
  ADMIN_QUICK_ACTIONS,
  EMPLOYEE_NAV,
  type NavItem,
} from "@/lib/nav";
import {
  useQuickActions,
  type QuickActionId,
} from "@/components/admin/quick-actions-provider";

interface SidebarProps {
  variant: "admin" | "employee";
  className?: string;
}

function employeeNavHref(href: string, employeeId: string | null): string {
  if (!employeeId || !href.startsWith("/my-")) return href;
  return `${href}?employee=${encodeURIComponent(employeeId)}`;
}

function EmployeeNavLinks({
  className,
  pathname,
}: {
  className?: string;
  pathname: string;
}) {
  const searchParams = useSearchParams();
  const previewEmployeeId = searchParams.get("employee");
  return (
    <ul className={cn("mt-2 space-y-1", className)}>
      {EMPLOYEE_NAV.map((item) => {
        const Icon = item.icon;
        const href = employeeNavHref(item.href, previewEmployeeId);
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function EmployeeNavLinksFallback({
  className,
  pathname,
}: {
  className?: string;
  pathname: string;
}) {
  return (
    <ul className={cn("mt-2 space-y-1", className)}>
      {EMPLOYEE_NAV.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ variant, className }: SidebarProps) {
  const pathname = usePathname();
  const items: NavItem[] = variant === "admin" ? ADMIN_NAV : EMPLOYEE_NAV;
  const heading = variant === "admin" ? "Planung" : "Mein Bereich";
  const quickActions = useQuickActions();

  return (
    <nav
      className={cn(
        "flex h-full flex-col gap-6 border-r border-neutral-200 bg-white px-4 py-6",
        className,
      )}
    >
      <div>
        <p className="px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {heading}
        </p>
        {variant === "employee" ? (
          <Suspense fallback={<EmployeeNavLinksFallback pathname={pathname} />}>
            <EmployeeNavLinks pathname={pathname} />
          </Suspense>
        ) : (
          <ul className="mt-2 space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {variant === "admin" ? (
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Schnellaktionen
          </p>
          <ul className="mt-2 space-y-2">
            {ADMIN_QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.id}>
                  <button
                    type="button"
                    onClick={() =>
                      quickActions.open(action.id as QuickActionId)
                    }
                    className="flex w-full items-center gap-3 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    <Icon className="h-4 w-4" />
                    {action.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
