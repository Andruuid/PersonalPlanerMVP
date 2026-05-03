import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  href: Route;
  icon: LucideIcon;
  hint?: string;
}

export function KpiCard({ label, value, href, icon: Icon, hint }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {label}
        </p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition group-hover:bg-neutral-900 group-hover:text-white">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-3xl font-semibold text-neutral-900 tabular-nums">
        {value}
      </p>
      <div className="mt-1 flex items-center justify-between">
        {hint ? (
          <p className="text-xs text-neutral-500">{hint}</p>
        ) : (
          <span />
        )}
        <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400 transition group-hover:text-neutral-700" />
      </div>
    </Link>
  );
}
