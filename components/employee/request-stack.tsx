"use client";

import { useState } from "react";
import {
  CalendarHeart,
  Baby,
  CalendarX,
  Hourglass,
  Timer,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RequestDialog } from "./request-dialog";
import type { RequestType, ServiceTemplateWishOption } from "./types";

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
    type: "UEZ_BEZUG",
    label: "UEZ beziehen",
    icon: Hourglass,
    variant: "outline",
  },
  {
    type: "TZT",
    label: "TZT erfassen",
    icon: Timer,
    variant: "outline",
  },
  {
    type: "FREE_DAY",
    label: "Freier Tag (Zeitsaldo)",
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

type DialogState =
  | null
  | { mode: "absence"; type: RequestType }
  | { mode: "wish" };

interface RequestStackProps {
  variant?: "panel" | "inline";
  /** Bei TARGET_REDUCTION gibt es keinen TZT-Abwesenheits-Antrag (Pensum = Reduktion). */
  tztModel?: "DAILY_QUOTA" | "TARGET_REDUCTION";
  serviceTemplates: ServiceTemplateWishOption[];
}

export function RequestStack({
  variant = "panel",
  tztModel = "DAILY_QUOTA",
  serviceTemplates,
}: RequestStackProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const buttons =
    tztModel === "TARGET_REDUCTION"
      ? BUTTONS.filter((b) => b.type !== "TZT")
      : BUTTONS;

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
        {buttons.map((btn) => {
          const Icon = btn.icon;
          return (
            <Button
              key={btn.type}
              type="button"
              onClick={() => setDialog({ mode: "absence", type: btn.type })}
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
        <Button
          type="button"
          variant="outline"
          className="justify-start bg-white"
          onClick={() => setDialog({ mode: "wish" })}
        >
          <CalendarClock className="mr-2 h-4 w-4" />
          Schicht-Wunsch
        </Button>
      </div>

      <RequestDialog
        open={dialog !== null}
        absenceType={dialog?.mode === "absence" ? dialog.type : null}
        defaultTab={dialog?.mode === "wish" ? "wish" : "absence"}
        serviceTemplates={serviceTemplates}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      />
    </section>
  );
}
