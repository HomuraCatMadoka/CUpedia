"use client";

import type { TCalloutElement } from "platejs";
import { type PlateElementProps, PlateElement } from "platejs/react";
import { cn } from "@udecode/cn";

const variantStyles: Record<
  string,
  { border: string; bg: string; icon: string }
> = {
  note: {
    border: "border-blue-300",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: "📝",
  },
  info: {
    border: "border-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    icon: "ℹ️",
  },
  tip: {
    border: "border-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    icon: "💡",
  },
  success: {
    border: "border-green-300",
    bg: "bg-green-50 dark:bg-green-950/30",
    icon: "✅",
  },
  warning: {
    border: "border-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: "⚠️",
  },
  error: {
    border: "border-red-300",
    bg: "bg-red-50 dark:bg-red-950/30",
    icon: "🚫",
  },
};

const defaultStyle = variantStyles.note;

export function CalloutElement(props: PlateElementProps<TCalloutElement>) {
  const { children, element, ...rest } = props;
  const variant = element.variant ?? "note";
  const style = variantStyles[variant] ?? defaultStyle;
  const icon = element.icon ?? style.icon;

  return (
    <PlateElement
      {...rest}
      element={element}
      className={cn(
        "my-2 flex gap-2 rounded-lg border-l-4 p-3",
        style.border,
        style.bg,
      )}
    >
      <span className="select-none text-lg" contentEditable={false}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </PlateElement>
  );
}
