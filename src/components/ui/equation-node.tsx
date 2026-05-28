"use client";

import type { TEquationElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useEquationElement, useEquationInput } from "@platejs/math/react";
import { PlateElement } from "platejs/react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const { children, element } = props;
  const katexRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEquationElement({
    element,
    katexRef,
    options: { displayMode: true, throwOnError: false },
  });

  const { props: inputProps, ref: inputRef } = useEquationInput({
    open,
    onClose: () => setOpen(false),
  });

  return (
    <PlateElement {...props}>
      <div
        className={cn(
          "my-2 rounded-lg border bg-muted/40 px-4 py-3",
          !open && "cursor-pointer hover:bg-muted/60",
        )}
        contentEditable={false}
        onClick={() => !open && setOpen(true)}
        role="button"
        tabIndex={0}
      >
        {open && (
          <textarea
            ref={inputRef}
            {...inputProps}
            className="mb-2 w-full resize-none rounded border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
            rows={3}
            placeholder="LaTeX expression..."
          />
        )}
        <div ref={katexRef} className={cn("text-center", open && "hidden")} />
        {!open && !element.texExpression && (
          <span className="text-sm text-muted-foreground">点击输入公式</span>
        )}
      </div>
      {children}
    </PlateElement>
  );
}
