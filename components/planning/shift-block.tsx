import { cn } from "@/lib/utils";
import { getShiftStyle, type ShiftKey } from "@/lib/shift-style";

interface ShiftBlockProps {
  shiftKey: ShiftKey;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

export function ShiftBlock({ shiftKey, label, size = "md", className }: ShiftBlockProps) {
  const style = getShiftStyle(shiftKey);
  const text = label ?? style.label;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium",
        size === "sm"
          ? "px-2.5 py-1 text-xs"
          : "px-3 py-1.5 text-xs",
        style.block,
        className,
      )}
    >
      {text}
    </span>
  );
}
