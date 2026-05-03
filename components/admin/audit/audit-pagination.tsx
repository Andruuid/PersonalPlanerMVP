import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /** URL query string for the current filter (without `page`). */
  baseQuery: string;
}

export function AuditPagination({
  page,
  totalPages,
  total,
  pageSize,
  baseQuery,
}: AuditPaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  function href(p: number): Route {
    const params = new URLSearchParams(baseQuery);
    if (p === 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    return (qs ? `?${qs}` : "?") as Route;
  }

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-neutral-500">
        {total === 0
          ? "Keine Einträge"
          : `Zeige ${start}–${end} von ${total} Einträgen`}
      </p>
      <div className="flex items-center gap-2">
        <PageButton
          href={href(page - 1)}
          disabled={prevDisabled}
          ariaLabel="Vorherige Seite"
        >
          <ChevronLeft className="h-4 w-4" />
        </PageButton>
        <span className="text-xs text-neutral-600">
          Seite {page} / {Math.max(1, totalPages)}
        </span>
        <PageButton
          href={href(page + 1)}
          disabled={nextDisabled}
          ariaLabel="Nächste Seite"
        >
          <ChevronRight className="h-4 w-4" />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  href,
  disabled,
  ariaLabel,
  children,
}: {
  href: Route;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const className = cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 transition",
    disabled
      ? "cursor-not-allowed opacity-40"
      : "hover:border-neutral-300 hover:bg-neutral-50",
  );
  if (disabled) {
    return (
      <span aria-disabled className={className} aria-label={ariaLabel}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}
