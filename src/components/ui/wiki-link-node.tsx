"use client";

import * as React from "react";

import { type TComboboxInputElement, KEYS } from "platejs";
import {
  type PlateEditor,
  type PlateElementProps,
  PlateElement,
} from "platejs/react";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

export type WikiLinkPage = { id: string; slug: string; title: string };

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

  return (
    <PlateElement {...props} as="span" data-testid="wiki-link-input">
      <InlineCombobox element={props.element} trigger="[[">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>无匹配页面</InlineComboboxEmpty>

          {pages.map((page) => (
            <InlineComboboxItem
              key={page.id}
              value={page.title}
              keywords={[page.slug]}
              onClick={() => insertWikiLink(editor, page)}
            >
              {page.title}
            </InlineComboboxItem>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
