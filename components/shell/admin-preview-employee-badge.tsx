"use client";

import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";

/** Shown when an admin previews the Mitarbeiter-Ansicht (?employee=…). */
export function AdminPreviewEmployeeBadge() {
  const searchParams = useSearchParams();
  const id = searchParams.get("employee");
  if (!id) return null;
  return (
    <Badge className="shrink-0 bg-amber-100 text-amber-900" title="Nur Lesen">
      Vorschau
    </Badge>
  );
}
