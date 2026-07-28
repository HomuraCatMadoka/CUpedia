"use client";

import * as React from "react";

import type { TLinkElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { getLinkAttributes } from "@platejs/link";
import { PlateElement } from "platejs/react";

import { cn } from "@/lib/utils";
import { inlineSuggestionVariants } from "@/lib/suggestion";

function isPlainLeftClick(event: React.MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      className={cn(
        "font-medium text-primary underline decoration-primary underline-offset-4",
        inlineSuggestionVariants(),
      )}
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        onMouseDown: (event) => {
          if (
            isPlainLeftClick(event) &&
            event.currentTarget instanceof HTMLAnchorElement
          ) {
            event.preventDefault();
          }
        },
        onClick: (event) => {
          if (
            !isPlainLeftClick(event) ||
            !(event.currentTarget instanceof HTMLAnchorElement)
          ) {
            return;
          }

          event.preventDefault();
          const { href, target } = event.currentTarget;
          if (target && target !== "_self") {
            window.open(href, target, "noopener,noreferrer");
          } else {
            window.location.assign(href);
          }
        },
        onMouseOver: (e) => {
          e.stopPropagation();
        },
      }}
    >
      {props.children}
    </PlateElement>
  );
}
