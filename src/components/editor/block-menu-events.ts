export const WIKI_OPEN_BLOCK_MENU_EVENT = "wiki:open-block-menu";

export function openWikiBlockMenu(blockId: string) {
  window.dispatchEvent(
    new CustomEvent(WIKI_OPEN_BLOCK_MENU_EVENT, {
      detail: { blockId },
    }),
  );
}
