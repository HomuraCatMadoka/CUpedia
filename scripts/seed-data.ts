import { fromMarkdown } from "../src/lib/plate-utils";

// ── Fixed UUIDs ──

export const USER_IDS = {
  admin: "00000000-0000-4000-a000-000000000001",
  user: "00000000-0000-4000-a000-000000000002",
  banned: "00000000-0000-4000-a000-000000000003",
  contributor: "00000000-0000-4000-a000-000000000004",
} as const;

export const ACCOUNT_IDS = {
  admin: "00000000-0000-4000-b000-000000000001",
  user: "00000000-0000-4000-b000-000000000002",
  banned: "00000000-0000-4000-b000-000000000003",
  contributor: "00000000-0000-4000-b000-000000000004",
} as const;

export const PAGE_IDS = {
  welcome: "00000000-0000-4000-c000-000000000001",
  gettingStarted: "00000000-0000-4000-c000-000000000002",
  campusLife: "00000000-0000-4000-c000-000000000003",
  dining: "00000000-0000-4000-c000-000000000004",
  diningUnited: "00000000-0000-4000-c000-000000000005",
  richContent: "00000000-0000-4000-c000-000000000006",
  history: "00000000-0000-4000-c000-000000000007",
  deleted: "00000000-0000-4000-c000-000000000008",
} as const;

export const REVISION_IDS = {
  welcome: "00000000-0000-4000-d000-000000000001",
  gettingStarted: "00000000-0000-4000-d000-000000000002",
  campusLife: "00000000-0000-4000-d000-000000000003",
  dining: "00000000-0000-4000-d000-000000000004",
  diningUnited: "00000000-0000-4000-d000-000000000005",
  richContent: "00000000-0000-4000-d000-000000000006",
  history1: "00000000-0000-4000-d000-000000000007",
  history2: "00000000-0000-4000-d000-000000000008",
  history3: "00000000-0000-4000-d000-000000000009",
  deleted: "00000000-0000-4000-d000-00000000000a",
} as const;

export const PASSWORD = "password123";

// Mirrors the setting keys in src/lib/site-settings.ts. Hardcoded here to keep
// seed data free of server-only DB imports. owner_user_id designates the site
// Owner (站长); in dev it is the seed admin. Production sets it once in the DB
// to the real operator — see docs/adr/0004-owner-tier-via-site-setting.md.
export const SEED_SITE_SETTINGS: SeedSiteSetting[] = [
  { key: "wiki_edit_role", value: "admin" },
  { key: "owner_user_id", value: USER_IDS.admin },
];

const DELETED_AT = new Date("2024-05-01T00:00:00Z");

// ── Users ──

export type SeedUser = {
  id: string;
  accountId: string;
  email: string;
  nickname: string;
  role: string;
  banned: boolean;
  image?: string;
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
  {
    id: USER_IDS.contributor,
    accountId: ACCOUNT_IDS.contributor,
    email: "contributor@test.com",
    nickname: "Contributor",
    role: "user",
    banned: false,
    image: "https://i.pravatar.cc/150?u=contributor",
  },
];

// ── Hand-authored Plate nodes ──
//
// fromMarkdown cannot emit block equations, callouts, or a TOC placeholder
// (markdown has no syntax the deserializer maps to those types). They are
// composed onto the converted markdown via a revision's `enrich` hook.

type PlateNode = Record<string, unknown>;

const TOC_NODE: PlateNode = { type: "toc", children: [{ text: "" }] };

const EQUATION_NODE: PlateNode = {
  type: "equation",
  texExpression: "\\int_0^1 x^2 \\, dx = \\tfrac{1}{3}",
  children: [{ text: "" }],
};

const CALLOUT_NODE: PlateNode = {
  type: "callout",
  variant: "info",
  children: [
    {
      type: "p",
      children: [
        { text: "CUpedia is maintained by students — contribute freely." },
      ],
    },
  ],
};

const RICH_MARKDOWN = [
  "# Rich Content Demo",
  "",
  "Inline math such as $E=mc^2$ renders within a paragraph.",
  "",
  "## Course Table",
  "",
  "| Course | Credits |",
  "| --- | --- |",
  "| CSCI1130 | 3 |",
  "| MATH1010 | 3 |",
  "",
  "## Code Sample",
  "",
  "```ts",
  'const greeting = "Hello CUHK";',
  "```",
].join("\n");

// ── Pages (authored as Markdown, stored as Plate JSON) ──

type RevisionSource = {
  id: string;
  title: string;
  editedBy: string;
  editSummary: string;
  markdown: string;
  enrich?: (nodes: PlateNode[]) => PlateNode[];
};

type SeedPageSource = {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  revisions: RevisionSource[]; // oldest → newest; page content = newest
};

const SEED_PAGE_SOURCES: SeedPageSource[] = [
  {
    id: PAGE_IDS.welcome,
    slug: "welcome",
    title: "Welcome to CUpedia",
    parentId: null,
    sortOrder: 0,
    createdBy: USER_IDS.admin,
    updatedBy: USER_IDS.admin,
    deletedAt: null,
    revisions: [
      {
        id: REVISION_IDS.welcome,
        title: "Welcome to CUpedia",
        editedBy: USER_IDS.admin,
        editSummary: "Initial page creation",
        markdown:
          "# Welcome\n\nThis is the home page of CUpedia, your go-to wiki for CUHK students.",
      },
    ],
  },
  {
    id: PAGE_IDS.gettingStarted,
    slug: "getting-started",
    title: "Getting Started",
    parentId: null,
    sortOrder: 1,
    createdBy: USER_IDS.admin,
    updatedBy: USER_IDS.admin,
    deletedAt: null,
    revisions: [
      {
        id: REVISION_IDS.gettingStarted,
        title: "Getting Started",
        editedBy: USER_IDS.admin,
        editSummary: "Initial page creation",
        markdown:
          "# Getting Started\n\nNew to CUHK? Here are some tips to help you settle in.\n\n## Registration\n\nVisit the [Registry](https://www.cuhk.edu.hk) for course registration.",
      },
    ],
  },
  {
    id: PAGE_IDS.campusLife,
    slug: "campus-life",
    title: "Campus Life",
    parentId: null,
    sortOrder: 2,
    createdBy: USER_IDS.admin,
    updatedBy: USER_IDS.admin,
    deletedAt: null,
    revisions: [
      {
        id: REVISION_IDS.campusLife,
        title: "Campus Life",
        editedBy: USER_IDS.admin,
        editSummary: "Initial page creation",
        markdown:
          "# Campus Life\n\nCUHK offers a vibrant campus life with clubs, sports, and events.",
      },
    ],
  },
  {
    id: PAGE_IDS.dining,
    slug: "campus-life/dining",
    title: "Dining on Campus",
    parentId: PAGE_IDS.campusLife,
    sortOrder: 0,
    createdBy: USER_IDS.admin,
    updatedBy: USER_IDS.admin,
    deletedAt: null,
    revisions: [
      {
        id: REVISION_IDS.dining,
        title: "Dining on Campus",
        editedBy: USER_IDS.admin,
        editSummary: "Initial page creation",
        markdown:
          "# Dining on Campus\n\nCUHK has many canteens across campus.\n\n## Popular Choices\n\n- United College Canteen\n- New Asia Canteen\n- Shaw College Canteen",
      },
    ],
  },
  {
    // Depth-3 hierarchy: campus-life → dining → dining/united
    id: PAGE_IDS.diningUnited,
    slug: "campus-life/dining/united",
    title: "United College Canteen",
    parentId: PAGE_IDS.dining,
    sortOrder: 0,
    createdBy: USER_IDS.contributor,
    updatedBy: USER_IDS.contributor,
    deletedAt: null,
    revisions: [
      {
        id: REVISION_IDS.diningUnited,
        title: "United College Canteen",
        editedBy: USER_IDS.contributor,
        editSummary: "Initial page creation",
        markdown:
          "# United College Canteen\n\nBudget-friendly meals near the University MTR station.",
      },
    ],
  },
  {
    // Rich content: markdown body + hand-authored TOC, equation, callout.
    id: PAGE_IDS.richContent,
    slug: "rich-content-demo",
    title: "Rich Content Demo",
    parentId: null,
    sortOrder: 3,
    createdBy: USER_IDS.contributor,
    updatedBy: USER_IDS.contributor,
    deletedAt: null,
    revisions: [
      {
        id: REVISION_IDS.richContent,
        title: "Rich Content Demo",
        editedBy: USER_IDS.contributor,
        editSummary: "Showcase math, tables, code, callout and TOC",
        markdown: RICH_MARKDOWN,
        enrich: (nodes) => [TOC_NODE, ...nodes, EQUATION_NODE, CALLOUT_NODE],
      },
    ],
  },
  {
    // Multi-revision history: 3 revisions by distinct editors.
    id: PAGE_IDS.history,
    slug: "history-demo",
    title: "Editing History Demo",
    parentId: null,
    sortOrder: 4,
    createdBy: USER_IDS.admin,
    updatedBy: USER_IDS.user,
    deletedAt: null,
    revisions: [
      {
        id: REVISION_IDS.history1,
        title: "Editing History Demo",
        editedBy: USER_IDS.admin,
        editSummary: "Initial draft",
        markdown: "# Editing History Demo\n\nFirst draft of the page.",
      },
      {
        id: REVISION_IDS.history2,
        title: "Editing History Demo",
        editedBy: USER_IDS.contributor,
        editSummary: "Expand the introduction",
        markdown:
          "# Editing History Demo\n\nFirst draft of the page.\n\nA contributor expanded the introduction with more detail.",
      },
      {
        id: REVISION_IDS.history3,
        title: "Editing History Demo",
        editedBy: USER_IDS.user,
        editSummary: "Add a closing note",
        markdown:
          "# Editing History Demo\n\nFirst draft of the page.\n\nA contributor expanded the introduction with more detail.\n\nA final note was added by a reader.",
      },
    ],
  },
  {
    // Soft-deleted page for the admin restore panel.
    id: PAGE_IDS.deleted,
    slug: "deleted-demo",
    title: "Deleted Page Demo",
    parentId: null,
    sortOrder: 5,
    createdBy: USER_IDS.admin,
    updatedBy: USER_IDS.admin,
    deletedAt: DELETED_AT,
    revisions: [
      {
        id: REVISION_IDS.deleted,
        title: "Deleted Page Demo",
        editedBy: USER_IDS.admin,
        editSummary: "Initial page creation",
        markdown:
          "# Deleted Page Demo\n\nThis page was soft-deleted and can be restored from the admin panel.",
      },
    ],
  },
];

export type SeedPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  parentId: string | null;
  sortOrder: number;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
};

export type SeedRevision = {
  id: string;
  pageId: string;
  title: string;
  content: string;
  editedBy: string;
  editSummary: string;
};

export type SeedSiteSetting = { key: string; value: string };

export type SeedData = {
  pages: SeedPage[];
  revisions: SeedRevision[];
  siteSettings: SeedSiteSetting[];
};

async function resolveContent(rev: RevisionSource): Promise<string> {
  const json = await fromMarkdown(rev.markdown);
  if (!rev.enrich) return json;
  return JSON.stringify(rev.enrich(JSON.parse(json) as PlateNode[]));
}

/**
 * Build seed pages and revisions with content serialized as Plate JSON.
 * The app stores wiki content as Plate JSON; markdown sources are converted
 * via `fromMarkdown` so the renderer and history/diff paths receive valid JSON.
 * A page's content equals its newest revision's content.
 */
export async function buildSeedData(): Promise<SeedData> {
  const pages: SeedPage[] = [];
  const revisions: SeedRevision[] = [];

  for (const src of SEED_PAGE_SOURCES) {
    const contents = await Promise.all(src.revisions.map(resolveContent));
    pages.push({
      id: src.id,
      slug: src.slug,
      title: src.title,
      content: contents[contents.length - 1],
      parentId: src.parentId,
      sortOrder: src.sortOrder,
      createdBy: src.createdBy,
      updatedBy: src.updatedBy,
      deletedAt: src.deletedAt,
    });
    src.revisions.forEach((rev, i) => {
      revisions.push({
        id: rev.id,
        pageId: src.id,
        title: rev.title,
        content: contents[i],
        editedBy: rev.editedBy,
        editSummary: rev.editSummary,
      });
    });
  }

  return { pages, revisions, siteSettings: SEED_SITE_SETTINGS };
}
