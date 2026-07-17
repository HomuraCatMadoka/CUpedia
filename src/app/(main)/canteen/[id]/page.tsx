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
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";
import { DanmakuBanner } from "@/components/home/danmaku-banner";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import { listCurrentMonthCanteenDanmaku } from "@/lib/danmaku-actions";
import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

async function getDanmakuViewer() {
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
    getMenuItemVoteCounts(id),
    getMyVotesForCanteen(id),
    getCommentCountsForCanteen(id),
    getSessionVoterUser(),
    mock ? Promise.resolve([]) : listCurrentMonthCanteenDanmaku(id),
    mock ? Promise.resolve({ kind: "guest" as const }) : getDanmakuViewer(),
  ]);
  const currentUserId =
    sessionUser && !sessionUser.banned ? sessionUser.id : null;
  const commentBlocked = sessionUser?.banned ? ("banned" as const) : null;

  return (
    <CanteenShell
      backHref="/canteen"
      backLabel="全部食堂"
      title={canteen.name}
      subtitle={canteen.location ?? undefined}
    >
      <div className="mb-10">
        <DanmakuBanner
          initialMessages={danmaku}
          viewer={danmakuViewer}
          title={`${canteen.name}本月弹幕`}
          apiPath={`/api/canteen/${id}/danmaku`}
        />
      </div>
      <CanteenMenuView
        items={items}
        voteCounts={voteCounts}
        myVotes={myVotes}
        commentCounts={commentCounts}
        currentUserId={currentUserId}
        commentBlocked={commentBlocked}
      />
    </CanteenShell>
  );
}
