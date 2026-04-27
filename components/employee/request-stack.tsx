"use client";

import { useState } from "react";
import {
  CalendarHeart,
  Baby,
  CalendarX,
  Hand,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RequestDialog } from "./request-dialog";
import type { RequestType } from "./types";

interface ButtonSpec {
  type: RequestType;
  label: string;
  icon: LucideIcon;
  variant: "primary" | "outline";
}

const BUTTONS: ButtonSpec[] = [
  {
    type: "VACATION",
    label: "Ferien beantragen",
    icon: CalendarHeart,
    variant: "primary",
  },
  {
    type: "FREE_REQUESTED",
    label: "Frei verlangt",
    icon: Hand,
    variant: "outline",
  },
  {
    type: "TZT",
    label: "TZT erfassen",
    icon: Hourglass,
    variant: "outline",
  },
  {
    type: "FREE_DAY",
    label: "Freien Tag angeben",
    icon: CalendarX,
    variant: "outline",
  },
  {
    type: "PARENTAL_CARE",
    label: "Eltern-/Betreuungsurlaub",
    icon: Baby,
    variant: "outline",
  },
];

interface RequestStackProps {
  variant?: "panel" | "inline";
}

export function RequestStack({ variant = "panel" }: RequestStackProps) {
  const [openType, setOpenType] = useState<RequestType | null>(null);

  const wrapperClass =
    variant === "panel"
      ? "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
      : "";

  return (
    <section className={wrapperClass}>
      {variant === "panel" ? (
        <header className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
            Antrag stellen
          </h2>
          <p className="text-xs text-neutral-500">
            Wünsche und Anträge gehen direkt an die Geschäftsleitung.
          </p>
        </header>
      ) : null}

      <div className="flex flex-col gap-2">
        {BUTTONS.map((btn) => {
          const Icon = btn.icon;
          return (
            <Button
              key={btn.type}
              type="button"
              onClick={() => setOpenType(btn.type)}
              variant={btn.variant === "primary" ? "default" : "outline"}
              className={cn(
                "justify-start",
                btn.variant === "primary" ? "" : "bg-white",
              )}
            >
              <Icon className="mr-2 h-4 w-4" />
              {btn.label}
            </Button>
          );
        })}
      </div>

      <RequestDialog
        open={openType !== null}
        type={openType}
        onOpenChange={(open) => {
          if (!open) setOpenType(null);
        }}
      />
    </section>
  );
}
