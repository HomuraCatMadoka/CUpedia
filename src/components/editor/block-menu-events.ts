export const WIKI_OPEN_BLOCK_MENU_EVENT = "wiki:open-block-menu";

export type WikiOpenBlockMenuDetail = { blockId: string };

export function openWikiBlockMenu(blockId: string) {
  window.dispatchEvent(
    new CustomEvent<WikiOpenBlockMenuDetail>(WIKI_OPEN_BLOCK_MENU_EVENT, {
      detail: { blockId },
    }),
  );
}
