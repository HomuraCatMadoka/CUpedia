import { fromMarkdown } from "../src/lib/plate-utils";

// ── Fixed UUIDs ──

export const USER_IDS = {
  admin: "00000000-0000-4000-a000-000000000001",
  user: "00000000-0000-4000-a000-000000000002",
  banned: "00000000-0000-4000-a000-000000000003",
} as const;

export const ACCOUNT_IDS = {
  admin: "00000000-0000-4000-b000-000000000001",
  user: "00000000-0000-4000-b000-000000000002",
  banned: "00000000-0000-4000-b000-000000000003",
} as const;

export const PAGE_IDS = {
  welcome: "00000000-0000-4000-c000-000000000001",
  gettingStarted: "00000000-0000-4000-c000-000000000002",
  campusLife: "00000000-0000-4000-c000-000000000003",
  dining: "00000000-0000-4000-c000-000000000004",
} as const;

export const REVISION_IDS = {
  welcome: "00000000-0000-4000-d000-000000000001",
  gettingStarted: "00000000-0000-4000-d000-000000000002",
  campusLife: "00000000-0000-4000-d000-000000000003",
  dining: "00000000-0000-4000-d000-000000000004",
} as const;

export const PASSWORD = "password123";

// ── Users ──

export type SeedUser = {
  id: string;
  accountId: string;
  email: string;
  nickname: string;
  role: string;
  banned: boolean;
};

export const SEED_USERS: SeedUser[] = [
  {
    id: USER_IDS.admin,
    accountId: ACCOUNT_IDS.admin,
    email: "admin@test.com",
    nickname: "Admin",
    role: "admin",
    banned: false,
  },
  {
    id: USER_IDS.user,
    accountId: ACCOUNT_IDS.user,
    email: "user@test.com",
    nickname: "TestUser",
    role: "user",
    banned: false,
  },
  {
    id: USER_IDS.banned,
    accountId: ACCOUNT_IDS.banned,
    email: "banned@test.com",
    nickname: "Banned",
    role: "user",
    banned: true,
  },
];

// ── Pages (authored as Markdown, stored as Plate JSON) ──

type SeedPageSource = {
  id: string;
  revisionId: string;
  slug: string;
  title: string;
  markdown: string;
  parentId: string | null;
  sortOrder: number;
};

const SEED_PAGE_SOURCES: SeedPageSource[] = [
  {
    id: PAGE_IDS.welcome,
    revisionId: REVISION_IDS.welcome,
    slug: "welcome",
    title: "Welcome to CUpedia",
    markdown:
      "# Welcome\n\nThis is the home page of CUpedia, your go-to wiki for CUHK students.",
    parentId: null,
    sortOrder: 0,
  },
  {
    id: PAGE_IDS.gettingStarted,
    revisionId: REVISION_IDS.gettingStarted,
    slug: "getting-started",
    title: "Getting Started",
    markdown:
      "# Getting Started\n\nNew to CUHK? Here are some tips to help you settle in.\n\n## Registration\n\nVisit the [Registry](https://www.cuhk.edu.hk) for course registration.",
    parentId: null,
    sortOrder: 1,
  },
  {
    id: PAGE_IDS.campusLife,
    revisionId: REVISION_IDS.campusLife,
    slug: "campus-life",
    title: "Campus Life",
    markdown:
      "# Campus Life\n\nCUHK offers a vibrant campus life with clubs, sports, and events.",
    parentId: null,
    sortOrder: 2,
  },
  {
    id: PAGE_IDS.dining,
    revisionId: REVISION_IDS.dining,
    slug: "campus-life/dining",
    title: "Dining on Campus",
    markdown:
      "# Dining on Campus\n\nCUHK has many canteens across campus.\n\n## Popular Choices\n\n- United College Canteen\n- New Asia Canteen\n- Shaw College Canteen",
    parentId: PAGE_IDS.campusLife,
    sortOrder: 0,
  },
];

export type SeedPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  parentId: string | null;
  sortOrder: number;
};

export type SeedRevision = {
  id: string;
  pageId: string;
  title: string;
  content: string;
  editSummary: string;
};

export type SeedData = {
  pages: SeedPage[];
  revisions: SeedRevision[];
};

/**
 * Build seed pages and revisions with content serialized as Plate JSON.
 * The app stores wiki content as Plate JSON; markdown sources are converted
 * via `fromMarkdown` so the renderer and history/diff paths receive valid JSON.
 */
export async function buildSeedData(): Promise<SeedData> {
  const pages: SeedPage[] = [];
  const revisions: SeedRevision[] = [];

  for (const src of SEED_PAGE_SOURCES) {
    const content = await fromMarkdown(src.markdown);
    pages.push({
      id: src.id,
      slug: src.slug,
      title: src.title,
      content,
      parentId: src.parentId,
      sortOrder: src.sortOrder,
    });
    revisions.push({
      id: src.revisionId,
      pageId: src.id,
      title: src.title,
      content,
      editSummary: "Initial page creation",
    });
  }

  return { pages, revisions };
}
