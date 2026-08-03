import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import {
  getMenuItemVoteCounts,
  getMyVotesForCanteen,
} from "@/lib/canteen-vote-actions";
import { getCommentCountsForCanteen } from "@/lib/canteen-comment-actions";
import { getOptionalUser, getSessionVoterUser } from "@/lib/auth-guard";
import { CanteenShell } from "@/components/canteen/canteen-shell";
import { CanteenQrAction } from "@/components/canteen/canteen-qr-badge";
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";
import { DanmakuBanner } from "@/components/home/danmaku-banner";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import { resolveCanteenQrSrc } from "@/lib/canteen-assets";
import { listCanteenDanmaku } from "@/lib/danmaku-actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isPgPermissionDenied, isPgSoftFail } from "@/lib/pg-errors";
import { messagesForFlyover, shuffleArray } from "@/lib/danmaku-types";

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

async function getDanmakuViewer() {
  try {
    const sessionUser = await getOptionalUser();
    if (!sessionUser?.id) return { kind: "guest" as const };

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, sessionUser.id),
      columns: { id: true, nickname: true, banned: true },
    });
    if (!dbUser) return { kind: "guest" as const };
    if (dbUser.banned) return { kind: "banned" as const };
    return {
      kind: "member" as const,
      userId: dbUser.id,
      nickname: dbUser.nickname,
    };
  } catch (error) {
    if (isPgSoftFail(error)) return { kind: "guest" as const };
    throw error;
  }
}

export default async function CanteenMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canteen = await getCanteenById(id);
  if (!canteen) notFound();

  const mock = isCanteenMockMode();
  const softEmpty =
    <T,>(fallback: T) =>
    (error: unknown) => {
      if (isPgSoftFail(error)) return fallback;
      throw error;
    };
  const [
    items,
    voteCounts,
    myVotes,
    commentCounts,
    sessionUser,
    danmaku,
    danmakuViewer,
  ] = await Promise.all([
    getCanteenMenuItems(id),
    getMenuItemVoteCounts(id).catch(softEmpty({})),
    getMyVotesForCanteen(id).catch(softEmpty({})),
    getCommentCountsForCanteen(id).catch(softEmpty({})),
    getSessionVoterUser().catch(softEmpty(null)),
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
  ]);
  const currentUserId =
    sessionUser && !sessionUser.banned ? sessionUser.id : null;
  const commentBlocked = sessionUser?.banned ? ("banned" as const) : null;
  const danmakuFly = shuffleArray(messagesForFlyover(danmaku));
  const qrSrc = resolveCanteenQrSrc(id, canteen.name);
  const displayedVoteCounts = mock
    ? { ...voteCounts, ...MOCK_VOTE_COUNTS }
    : voteCounts;

  return (
    <CanteenShell
      backHref="/canteen"
      backLabel="全部食堂"
      title={canteen.name}
      subtitle={canteen.location ?? undefined}
      announcement={canteen.announcement}
      className="canteen-detail-page"
      action={<CanteenQrAction src={qrSrc} canteenName={canteen.name} />}
      topContent={
        <DanmakuBanner
          initialMessages={danmaku}
          initialFlyMessages={danmakuFly}
          viewer={danmakuViewer}
          title="弹幕"
          apiPath={`/api/canteen/${id}/danmaku`}
          trackCount={3}
          appearance="hero"
        />
      }
    >
      <CanteenMenuView
        items={items}
        voteCounts={displayedVoteCounts}
        myVotes={myVotes}
        commentCounts={commentCounts}
        currentUserId={currentUserId}
        commentBlocked={commentBlocked}
      />
    </CanteenShell>
  );
}
