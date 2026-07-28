export interface WikiTreePage {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
}

export type WikiTreePagePatch = Pick<WikiTreePage, "id"> &
  Partial<Omit<WikiTreePage, "id">>;

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

function applyMutation(
  pages: WikiTreePage[],
  mutation: WikiTreeMutation,
  authoritativePage?: WikiTreePage,
) {
  if (mutation.type === "delete") {
    return deleteBranch(pages, mutation.pageId);
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
