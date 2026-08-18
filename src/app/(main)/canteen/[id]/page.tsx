import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  getCanteenById,
  getCanteenMenuItems,
  getCanteenOrderingHandoff,
} from "@/lib/canteen-actions";
import {
  getMenuItemVoteCounts,
  getMyVotesForCanteen,
} from "@/lib/canteen-vote-actions";
import { getCommentCountsForCanteen } from "@/lib/canteen-comment-actions";
import { getOptionalUser, getSessionVoterUser } from "@/lib/auth-guard";
import { CanteenShell } from "@/components/canteen/canteen-shell";
import { CanteenOrderAction } from "@/components/canteen/canteen-order-action";
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";
import { CanteenMenuSkeleton } from "@/components/canteen/canteen-menu-skeleton";
import { DanmakuBanner } from "@/components/home/danmaku-banner";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import { listCanteenDanmaku } from "@/lib/danmaku-actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isPgPermissionDenied, isPgSoftFail } from "@/lib/pg-errors";
import {
  messagesForFlyover,
  shuffleArray,
  type PublicDanmakuMessage,
} from "@/lib/danmaku-types";
import type {
  CanteenMenuItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";

export const dynamic = "force-dynamic";

const MOCK_DANMAKU = [
  "今天出餐很稳",
  "热门窗口排得有点久",
  "两点后人少很多",
  "饮品可以少甜",
] as const;

const MOCK_VOTE_COUNTS = {
  "mock-item-bf-noodle": { likes: 8, dislikes: 1 },
  "mock-item-bf-egg": { likes: 1, dislikes: 7 },
  "mock-item-ln-rice-2": { likes: 12, dislikes: 2 },
  "mock-item-ln-fish": { likes: 2, dislikes: 9 },
  "mock-item-dn-rice": { likes: 11, dislikes: 2 },
  "mock-item-dn-noodle": { likes: 1, dislikes: 8 },
} as const;

const softEmpty =
  <T,>(fallback: T) =>
  (error: unknown) => {
    if (isPgSoftFail(error)) return fallback;
    throw error;
  };

type CanteenViewer =
  | { kind: "guest" }
  | { kind: "banned" }
  | { kind: "member"; userId: string; nickname: string };

async function getDanmakuViewer(): Promise<CanteenViewer> {
  try {
    const sessionUser = await getOptionalUser();
    if (!sessionUser?.id) return { kind: "guest" };

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, sessionUser.id),
      columns: { id: true, nickname: true, banned: true },
    });
    if (!dbUser) return { kind: "guest" };
    if (dbUser.banned) return { kind: "banned" };
    return {
      kind: "member",
      userId: dbUser.id,
      nickname: dbUser.nickname,
    };
  } catch (error) {
    if (isPgSoftFail(error)) return { kind: "guest" };
    throw error;
  }
}

type MenuBundle = {
  items: CanteenMenuItem[];
  voteCounts: Record<string, MenuItemVoteCounts>;
  myVotes: Record<string, VoteChoice>;
  commentCounts: Record<string, number>;
  sessionUser: { id: string; banned: boolean } | null;
};

function loadMenuBundle(id: string): Promise<MenuBundle> {
  return Promise.all([
    getCanteenMenuItems(id),
    getMenuItemVoteCounts(id).catch(softEmpty({})),
    getMyVotesForCanteen(id).catch(softEmpty({})),
    getCommentCountsForCanteen(id).catch(softEmpty({})),
    getSessionVoterUser().catch(softEmpty(null)),
  ]).then(([items, voteCounts, myVotes, commentCounts, sessionUser]) => ({
    items,
    voteCounts,
    myVotes,
    commentCounts,
    sessionUser,
  }));
}

type DanmakuBundle = {
  danmaku: PublicDanmakuMessage[];
  viewer: CanteenViewer;
};

function loadDanmakuBundle(id: string): Promise<DanmakuBundle> {
  const mock = isCanteenMockMode();
  return Promise.all([
    mock
      ? Promise.resolve(
          MOCK_DANMAKU.map((content, index) => {
            const createdAt = new Date();
            return {
              id: `mock-canteen-danmaku-${index + 1}`,
              content,
              month: createdAt.toISOString().slice(0, 7),
              createdAt,
            };
          }),
        )
      : listCanteenDanmaku(id).catch((error) => {
          if (isPgSoftFail(error) || isPgPermissionDenied(error)) return [];
          throw error;
        }),
    mock ? Promise.resolve({ kind: "guest" as const }) : getDanmakuViewer(),
  ]).then(([danmaku, viewer]) => ({ danmaku, viewer }));
}

async function CanteenMenuSection({
  data,
}: {
  data: Promise<MenuBundle>;
}) {
  const { items, voteCounts, myVotes, commentCounts, sessionUser } = await data;
  const currentUserId =
    sessionUser && !sessionUser.banned ? sessionUser.id : null;
  const commentBlocked = sessionUser?.banned ? ("banned" as const) : null;
  const displayedVoteCounts = isCanteenMockMode()
    ? { ...voteCounts, ...MOCK_VOTE_COUNTS }
    : voteCounts;

  return (
    <CanteenMenuView
      items={items}
      voteCounts={displayedVoteCounts}
      myVotes={myVotes}
      commentCounts={commentCounts}
      currentUserId={currentUserId}
      commentBlocked={commentBlocked}
    />
  );
}

async function CanteenDanmakuSection({
  id,
  data,
}: {
  id: string;
  data: Promise<DanmakuBundle>;
}) {
  const { danmaku, viewer } = await data;
  const danmakuFly = shuffleArray(messagesForFlyover(danmaku));
  return (
    <DanmakuBanner
      initialMessages={danmaku}
      initialFlyMessages={danmakuFly}
      viewer={viewer}
      apiPath={`/api/canteen/${id}/danmaku`}
      trackCount={3}
      appearance="hero"
    />
  );
}

export default async function CanteenMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const menuPromise = loadMenuBundle(id);
  const danmakuPromise = loadDanmakuBundle(id);
  const [canteen, orderingHandoff] = await Promise.all([
    getCanteenById(id),
    getCanteenOrderingHandoff(id).catch(softEmpty(null)),
  ]);
  if (!canteen) notFound();

  const orderUrl = orderingHandoff?.url ?? null;

  return (
    <CanteenShell
      backHref="/canteen"
      backLabel="全部食堂"
      title={canteen.name}
      subtitle={canteen.location ?? undefined}
      announcement={canteen.announcement}
      className="canteen-detail-page"
      action={<CanteenOrderAction href={orderUrl} canteenName={canteen.name} />}
      topContent={
        <Suspense
          fallback={
            <div
              className="h-24 animate-pulse rounded-xl bg-[var(--canteen-line)]"
              aria-hidden
            />
          }
        >
          <CanteenDanmakuSection id={id} data={danmakuPromise} />
        </Suspense>
      }
    >
      <Suspense fallback={<CanteenMenuSkeleton />}>
        <CanteenMenuSection data={menuPromise} />
      </Suspense>
    </CanteenShell>
  );
}
