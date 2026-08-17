export interface WikiTreePage {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
}

export type WikiTreePagePatch = Pick<WikiTreePage, "id"> &
  Partial<Omit<WikiTreePage, "id">>;

export type WikiPageMove =
  | { direction: "up" | "down" }
  | { targetPageId: string; placement: "before" | "after" };

export type WikiSiblingReorderResult<
  T extends { id: string; sortOrder: number },
> =
  | {
      status: "moved";
      siblings: T[];
      updates: { id: T["id"]; sortOrder: T["sortOrder"] }[];
    }
  | { status: "unchanged" }
  | { status: "source-not-found" }
  | { status: "target-not-found" };

export type WikiTreeMutation =
  | {
      token: string;
      type: "upsert";
      page: WikiTreePage;
    }
  | {
      token: string;
      type: "delete";
      pageId: string;
    }
  | {
      token: string;
      type: "reorder";
      siblings: WikiTreePage[];
    };

type PendingWikiTreeMutation = WikiTreeMutation & {
  confirmed?: true;
  authoritativePage?: WikiTreePage;
};

export interface WikiTreeState {
  confirmed: WikiTreePage[];
  pending: PendingWikiTreeMutation[];
}

export type WikiTreeAction =
  | { type: "hydrate"; pages: WikiTreePage[] }
  | { type: "project"; mutation: WikiTreeMutation }
  | { type: "confirm"; token: string; page?: WikiTreePagePatch }
  | { type: "rollback"; token: string };

export function createWikiTreeState(pages: WikiTreePage[]): WikiTreeState {
  return { confirmed: pages, pending: [] };
}

function upsertPage(pages: WikiTreePage[], page: WikiTreePage) {
  const index = pages.findIndex((candidate) => candidate.id === page.id);
  if (index === -1) return [...pages, page];
  const next = [...pages];
  next[index] = page;
  return next;
}

function deleteBranch(pages: WikiTreePage[], pageId: string) {
  const deletedIds = new Set([pageId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages) {
      if (
        page.parentId &&
        deletedIds.has(page.parentId) &&
        !deletedIds.has(page.id)
      ) {
        deletedIds.add(page.id);
        changed = true;
      }
    }
  }
  return pages.filter((page) => !deletedIds.has(page.id));
}

function applySiblingOrder(pages: WikiTreePage[], siblings: WikiTreePage[]) {
  const siblingIds = new Set(siblings.map((page) => page.id));
  let cursor = 0;
  return pages.map((page) =>
    siblingIds.has(page.id) ? siblings[cursor++] : page,
  );
}

export function reorderWikiSiblings<
  T extends { id: string; sortOrder: number },
>(
  siblings: T[],
  pageId: string,
  move: WikiPageMove,
): WikiSiblingReorderResult<T> {
  const reordered = [...siblings];
  const sourceIndex = siblings.findIndex(
    (candidate) => candidate.id === pageId,
  );
  if (sourceIndex < 0) return { status: "source-not-found" };

  let targetPageId: string;
  let placement: "before" | "after";
  if ("direction" in move) {
    const targetIndex = sourceIndex + (move.direction === "up" ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= reordered.length) {
      return { status: "unchanged" };
    }
    targetPageId = reordered[targetIndex].id;
    placement = move.direction === "up" ? "before" : "after";
  } else {
    targetPageId = move.targetPageId;
    placement = move.placement;
  }

  if (targetPageId === pageId) return { status: "unchanged" };
  const [source] = reordered.splice(sourceIndex, 1);
  const targetIndex = reordered.findIndex(
    (candidate) => candidate.id === targetPageId,
  );
  if (targetIndex < 0) return { status: "target-not-found" };
  reordered.splice(targetIndex + (placement === "after" ? 1 : 0), 0, source);

  if (reordered.every((sibling, index) => sibling.id === siblings[index].id)) {
    return { status: "unchanged" };
  }

  const previousSortOrders = new Map(
    siblings.map((sibling) => [sibling.id, sibling.sortOrder]),
  );
  const nextSiblings = reordered.map((sibling, sortOrder) => ({
    ...sibling,
    sortOrder,
  }));

  return {
    status: "moved",
    siblings: nextSiblings,
    updates: nextSiblings
      .filter(
        (sibling) => previousSortOrders.get(sibling.id) !== sibling.sortOrder,
      )
      .map(({ id, sortOrder }) => ({ id, sortOrder })),
  };
}

export function reorderWikiTreeSiblings(
  pages: WikiTreePage[],
  pageId: string,
  move: WikiPageMove,
): WikiTreePage[] | null {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) return null;

  const result = reorderWikiSiblings(
    pages.filter((candidate) => candidate.parentId === page.parentId),
    pageId,
    move,
  );
  return result.status === "moved" ? result.siblings : null;
}

function applyMutation(
  pages: WikiTreePage[],
  mutation: WikiTreeMutation,
  authoritativePage?: WikiTreePage,
) {
  if (mutation.type === "delete") {
    return deleteBranch(pages, mutation.pageId);
  }
  if (mutation.type === "reorder") {
    return applySiblingOrder(pages, mutation.siblings);
  }
  return upsertPage(pages, authoritativePage ?? mutation.page);
}

export function projectWikiTreePages(state: WikiTreeState): WikiTreePage[] {
  return state.pending.reduce(
    (pages, mutation) =>
      applyMutation(pages, mutation, mutation.authoritativePage),
    state.confirmed,
  );
}

function drainConfirmedMutations(state: WikiTreeState): WikiTreeState {
  let confirmed = state.confirmed;
  let cursor = 0;
  while (state.pending[cursor]?.confirmed) {
    const mutation = state.pending[cursor];
    confirmed = applyMutation(confirmed, mutation, mutation.authoritativePage);
    cursor += 1;
  }
  return cursor ? { confirmed, pending: state.pending.slice(cursor) } : state;
}

export function wikiTreeReducer(
  state: WikiTreeState,
  action: WikiTreeAction,
): WikiTreeState {
  switch (action.type) {
    case "hydrate":
      return { ...state, confirmed: action.pages };
    case "project":
      return { ...state, pending: [...state.pending, action.mutation] };
    case "rollback":
      return drainConfirmedMutations({
        ...state,
        pending: state.pending.filter(
          (mutation) => mutation.token !== action.token,
        ),
      });
    case "confirm": {
      const mutation = state.pending.find(
        (candidate) => candidate.token === action.token,
      );
      if (!mutation) return state;
      const authoritativePage =
        mutation.type === "upsert" && action.page
          ? { ...mutation.page, ...action.page }
          : undefined;
      return drainConfirmedMutations({
        ...state,
        pending: state.pending.map((candidate) =>
          candidate.token === action.token
            ? {
                ...candidate,
                confirmed: true,
                authoritativePage,
              }
            : candidate,
        ),
      });
    }
  }
}
