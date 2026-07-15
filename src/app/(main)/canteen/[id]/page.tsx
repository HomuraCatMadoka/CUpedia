import { notFound } from "next/navigation";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import {
  getMenuItemVoteCounts,
  getMyVotesForCanteen,
} from "@/lib/canteen-vote-actions";
import { getCommentCountsForCanteen } from "@/lib/canteen-comment-actions";
import { getSessionVoterUser } from "@/lib/auth-guard";
import { CanteenShell } from "@/components/canteen/canteen-shell";
import { CanteenMenuView } from "@/components/canteen/canteen-menu-view";

export default async function CanteenMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canteen = await getCanteenById(id);
  if (!canteen) notFound();

  const [items, voteCounts, myVotes, commentCounts, sessionUser] =
    await Promise.all([
      getCanteenMenuItems(id),
      getMenuItemVoteCounts(id),
      getMyVotesForCanteen(id),
      getCommentCountsForCanteen(id),
      getSessionVoterUser(),
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
