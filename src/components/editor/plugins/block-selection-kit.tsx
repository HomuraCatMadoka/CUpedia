"use client";

import { BlockSelectionPlugin } from "@platejs/selection/react";

import { openWikiBlockMenu } from "@/components/editor/block-menu-events";

export const BlockSelectionKit = [
  BlockSelectionPlugin.configure({
    options: {
      isSelectable: (_element, path) => path.length === 1,
      onKeyDownSelecting: (editor, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "/") {
          const selectedBlock = editor
            .getApi(BlockSelectionPlugin)
            .blockSelection.first();
          const selectedId = selectedBlock?.[0].id as string | undefined;
          if (!selectedId) return;

          event.preventDefault();
          event.stopPropagation();
          openWikiBlockMenu(selectedId);
          return;
        }

        if (event.key !== "Tab" || event.shiftKey) return;

        const firstControl = document.querySelector<HTMLButtonElement>(
          '[data-block-selected="true"] [data-wiki-block-control][tabindex="0"]',
        );
        if (!firstControl) return;

        event.preventDefault();
        event.stopPropagation();
        firstControl.focus();
      },
    },
  }),
];
