"use client";

import type { TEquationElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useEquationElement, useEquationInput } from "@platejs/math/react";
import { PlateElement } from "platejs/react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function InlineEquationElement(
  props: PlateElementProps<TEquationElement>,
) {
  const { children, element } = props;
  const katexRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEquationElement({
    element,
    katexRef,
    options: { displayMode: false, throwOnError: false },
  });

  const { props: inputProps, ref: inputRef } = useEquationInput({
    isInline: true,
    open,
    onClose: () => setOpen(false),
  });

  return (
    <PlateElement {...props} as="span">
      <span
        className={cn(
          "inline rounded px-0.5",
          !open && "cursor-pointer hover:bg-muted/60",
        )}
        contentEditable={false}
        onClick={() => !open && setOpen(true)}
        role="button"
        tabIndex={0}
      >
        {open && (
          <span className="inline-flex items-center rounded border bg-muted/40 px-1">
            <textarea
              ref={inputRef}
              {...inputProps}
              className="w-32 resize-none bg-transparent px-1 font-mono text-sm outline-none"
              rows={1}
              placeholder="LaTeX..."
            />
          </span>
        )}
        <span ref={katexRef} className={cn(open && "hidden")} />
        {!open && !element.texExpression && (
          <span className="font-mono text-xs text-muted-foreground">$...$</span>
        )}
      </span>
      {children}
    </PlateElement>
  );
}
