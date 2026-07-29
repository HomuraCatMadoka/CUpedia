import * as React from "react";

import type { TLinkElement } from "platejs";
import type { SlateElementProps } from "platejs/static";

import { getLinkAttributes } from "@platejs/link";
import { FileTextIcon } from "lucide-react";
import { SlateElement } from "platejs/static";
import { cn } from "@/lib/utils";
import { inlineSuggestionVariants } from "@/lib/suggestion";
import { isWikiPageId } from "@/lib/wiki-links";

export function LinkElementStatic(props: SlateElementProps<TLinkElement>) {
  const linkAttributes = getLinkAttributes(props.editor, props.element);
  const rawPageId = (props.element as TLinkElement & { pageId?: unknown })
    .pageId;
  const pageId = isWikiPageId(rawPageId) ? rawPageId : null;
  const wikiHref = pageId ? `/wiki/${pageId}` : null;

  return (
    <SlateElement
      {...props}
      as="a"
      className={cn(
        pageId
          ? "-mx-0.5 cursor-pointer rounded-[3px] px-0.5 font-medium text-primary underline decoration-primary/50 underline-offset-[3px] transition-[background-color,color,text-decoration-color] duration-100 hover:bg-black/[0.055] hover:decoration-primary active:bg-black/[0.11] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none dark:hover:bg-white/[0.08] dark:active:bg-white/[0.14]"
          : "cursor-pointer font-medium text-primary underline decoration-primary underline-offset-4",
        inlineSuggestionVariants(),
      )}
      attributes={{
        ...props.attributes,
        ...linkAttributes,
        href: wikiHref ?? linkAttributes.href,
        "data-wiki-link": pageId ? "true" : undefined,
      }}
    >
      {pageId && (
        <span
          aria-hidden="true"
          data-testid="wiki-link-icon"
          className="mr-0.5 inline-flex size-[0.9em] align-[-0.08em] text-muted-foreground"
        >
          <FileTextIcon className="size-full" />
        </span>
      )}
      {props.children}
    </SlateElement>
  );
}
