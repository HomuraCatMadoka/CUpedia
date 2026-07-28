"use client";

import * as React from "react";

import type { TLinkElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { getLinkAttributes } from "@platejs/link";
import { FileTextIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { PlateElement } from "platejs/react";

import { cn } from "@/lib/utils";
import { inlineSuggestionVariants } from "@/lib/suggestion";
import { isWikiPageId } from "@/lib/wiki-links";

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
  const router = useRouter();
  const prefetched = React.useRef(false);
  const pageId = isWikiPageId(
    (props.element as TLinkElement & { pageId?: unknown }).pageId,
  )
    ? (props.element as TLinkElement & { pageId: string }).pageId
    : null;
  const wikiHref = pageId ? `/wiki/${pageId}` : null;
  const prefetchWikiPage = () => {
    if (wikiHref && !prefetched.current) {
      prefetched.current = true;
      router.prefetch(wikiHref);
    }
  };

  return (
    <PlateElement
      {...props}
      as="a"
      className={cn(
        pageId
          ? "-mx-0.5 rounded-[3px] px-0.5 font-medium text-primary underline decoration-primary/50 underline-offset-[3px] transition-[background-color,color,text-decoration-color] duration-100 hover:bg-black/[0.055] hover:decoration-primary active:bg-black/[0.11] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none dark:hover:bg-white/[0.08] dark:active:bg-white/[0.14]"
          : "font-medium text-primary underline decoration-primary underline-offset-4",
        inlineSuggestionVariants(),
      )}
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        "data-wiki-link": pageId ? "true" : undefined,
        onFocus: prefetchWikiPage,
        onMouseEnter: prefetchWikiPage,
        onPointerDown: (event) => {
          if (event.pointerType !== "mouse") prefetchWikiPage();
        },
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
          } else if (wikiHref) {
            router.push(wikiHref);
          } else {
            window.location.assign(href);
          }
        },
        onMouseOver: (e) => {
          e.stopPropagation();
        },
      }}
    >
      {pageId && (
        <span
          aria-hidden="true"
          contentEditable={false}
          data-testid="wiki-link-icon"
          className="mr-0.5 inline-flex size-[0.9em] align-[-0.08em] text-muted-foreground"
        >
          <FileTextIcon className="size-full" />
        </span>
      )}
      {props.children}
    </PlateElement>
  );
}
