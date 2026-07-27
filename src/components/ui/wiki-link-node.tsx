"use client";

import * as React from "react";

import { type TComboboxInputElement, KEYS } from "platejs";
import {
  type PlateEditor,
  type PlateElementProps,
  PlateElement,
} from "platejs/react";
import { FileTextIcon } from "lucide-react";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

export type WikiLinkPage = {
  id: string;
  slug: string;
  title: string;
  icon?: string | null;
};
type TWikiLinkInputElement = TComboboxInputElement & {
  displayTrigger?: string;
};

const PagesContext = React.createContext<WikiLinkPage[]>([]);

export function WikiLinkPagesProvider({
  pages,
  children,
}: {
  pages: WikiLinkPage[];
  children: React.ReactNode;
}) {
  return (
    <PagesContext.Provider value={pages}>{children}</PagesContext.Provider>
  );
}

function insertWikiLink(editor: PlateEditor, page: WikiLinkPage) {
  // The first "[" of the "[[" trigger stays as literal text before the input
  // element; drop it so only the link node remains.
  if (
    editor.api.string(editor.api.range("before", editor.selection!)) === "["
  ) {
    editor.tf.deleteBackward("character");
  }
  editor.tf.insertNodes({
    type: KEYS.link,
    url: `/wiki/${page.slug}`,
    pageId: page.id,
    children: [{ text: page.title }],
  });
}

export function WikiLinkInputElement(
  props: PlateElementProps<TComboboxInputElement>,
) {
  const { editor } = props;
  const pages = React.useContext(PagesContext);
  const trigger =
    (props.element as TWikiLinkInputElement).displayTrigger ?? "[[";

  return (
    <PlateElement {...props} as="span" data-testid="wiki-link-input">
      <InlineCombobox
        element={props.element}
        historyStateKey={
          trigger === "@" ? "cupediaMobileMentionToken" : undefined
        }
        trigger={trigger}
      >
        <InlineComboboxInput aria-label="提及 Wiki 页面" />

        <InlineComboboxContent
          data-testid="wiki-link-picker"
          className="max-h-[260px] w-[min(332px,calc(100vw-22px))] overscroll-contain rounded-xl border border-black/10 bg-[#f7f7f5] py-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)] sm:max-h-[288px] sm:w-[300px] sm:rounded-md dark:border-white/10 dark:bg-[#252525]"
        >
          <InlineComboboxEmpty className="h-11 px-3">
            无匹配页面
          </InlineComboboxEmpty>

          <InlineComboboxGroup>
            <InlineComboboxGroupLabel className="mb-1 px-[18px] pt-1 text-[15px]">
              Wiki 页面
            </InlineComboboxGroupLabel>
            {pages.map((page) => (
              <InlineComboboxItem
                key={page.id}
                value={page.title}
                keywords={[page.slug]}
                onClick={() => insertWikiLink(editor, page)}
                className="mx-[10px] h-11 gap-3 rounded-md px-3 text-[16px] transition-none data-[active-item=true]:bg-black/[0.075] dark:data-[active-item=true]:bg-white/10"
              >
                <span
                  data-testid="wiki-link-page-icon"
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center text-[19px] leading-none text-[#9b9a97]"
                >
                  {page.icon ? page.icon : <FileTextIcon className="size-5" />}
                </span>
                <span className="truncate">{page.title}</span>
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
