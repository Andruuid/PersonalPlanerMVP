"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpIconTooltipProps {
  text: string;
  ariaLabel?: string;
  contentClassName?: string;
}

export function HelpIconTooltip({
  text,
  ariaLabel = "Hilfe anzeigen",
  contentClassName,
}: HelpIconTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center text-neutral-500 hover:text-neutral-800"
          aria-label={ariaLabel}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className={contentClassName ?? "max-w-72"}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
