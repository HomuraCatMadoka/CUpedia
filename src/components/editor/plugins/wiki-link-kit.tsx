"use client";

import { withTriggerCombobox } from "@platejs/combobox";
import { createTSlatePlugin, type SlateEditor, KEYS } from "platejs";
import { createPlatePlugin, toPlatePlugin } from "platejs/react";

import { WikiLinkInputElement } from "@/components/ui/wiki-link-node";

const WIKI_LINK_INPUT_KEY = "wiki_link_input";

const BaseWikiLinkInputPlugin = createPlatePlugin({
  key: WIKI_LINK_INPUT_KEY,
  editOnly: true,
  node: { isElement: true, isInline: true, isVoid: true },
});

const BaseWikiLinkPlugin = createTSlatePlugin({
  key: "wiki_link",
  editOnly: true,
  options: {
    trigger: "[",
    // Open only on the second "[" of "[[".
    triggerPreviousCharPattern: /^\[$/,
    createComboboxInput: () => ({
      children: [{ text: "" }],
      type: WIKI_LINK_INPUT_KEY,
    }),
    triggerQuery: (editor: SlateEditor) =>
      !editor.api.some({ match: { type: editor.getType(KEYS.codeBlock) } }),
  },
  plugins: [BaseWikiLinkInputPlugin],
}).overrideEditor(withTriggerCombobox);

const WikiLinkPlugin = toPlatePlugin(BaseWikiLinkPlugin);

export const WikiLinkKit = [
  WikiLinkPlugin,
  BaseWikiLinkInputPlugin.withComponent(WikiLinkInputElement),
];
