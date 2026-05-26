"use client";

import * as React from "react";

import type { PlateElementProps } from "platejs/react";

import { type VariantProps, cva } from "class-variance-authority";
import { PlateElement, useElement } from "platejs/react";

import { headingSlug } from "@/lib/headings";

const headingVariants = cva(
  "relative mb-1 data-[nav-target=true]:rounded-md data-[nav-target=true]:bg-(--color-highlight)",
  {
    variants: {
      variant: {
        h1: "mt-[1.6em] pb-1 font-bold font-heading text-4xl",
        h2: "mt-[1.4em] pb-px font-heading font-semibold text-2xl tracking-tight",
        h3: "mt-[1em] pb-px font-heading font-semibold text-xl tracking-tight",
        h4: "mt-[0.75em] font-heading font-semibold text-lg tracking-tight",
        h5: "mt-[0.75em] font-semibold text-lg tracking-tight",
        h6: "mt-[0.75em] font-semibold text-base tracking-tight",
      },
    },
  },
);

function extractElementText(node: {
  text?: string;
  children?: unknown[];
}): string {
  if (typeof node.text === "string") return node.text;
  if (!node.children) return "";
  return (node.children as { text?: string; children?: unknown[] }[])
    .map(extractElementText)
    .join("");
}

export function HeadingElement({
  variant = "h1",
  ...props
}: PlateElementProps & VariantProps<typeof headingVariants>) {
  const element = useElement();
  const shouldHaveId = variant === "h2" || variant === "h3";
  const anchorId = shouldHaveId
    ? headingSlug(extractElementText(element as never))
    : undefined;

  return (
    <PlateElement
      as={variant!}
      className={headingVariants({ variant })}
      {...props}
      attributes={{ ...props.attributes, id: anchorId } as never}
    >
      {props.children}
    </PlateElement>
  );
}

export function H1Element(props: PlateElementProps) {
  return <HeadingElement variant="h1" {...props} />;
}

export function H2Element(props: PlateElementProps) {
  return <HeadingElement variant="h2" {...props} />;
}

export function H3Element(props: PlateElementProps) {
  return <HeadingElement variant="h3" {...props} />;
}

export function H4Element(props: PlateElementProps) {
  return <HeadingElement variant="h4" {...props} />;
}

export function H5Element(props: PlateElementProps) {
  return <HeadingElement variant="h5" {...props} />;
}

export function H6Element(props: PlateElementProps) {
  return <HeadingElement variant="h6" {...props} />;
}
