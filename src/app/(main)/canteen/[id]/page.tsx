import Link from "next/link";
import { notFound } from "next/navigation";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import {
  getMenuItemVoteCounts,
  getMyVotesForCanteen,
} from "@/lib/canteen-vote-actions";
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

  const [items, voteCounts, myVotes] = await Promise.all([
    getCanteenMenuItems(id),
    getMenuItemVoteCounts(id),
    getMyVotesForCanteen(id),
  ]);

  return (
    <CanteenShell
      eyebrow={
        <Link href="/canteen" className="hover:text-[var(--canteen-purple)]">
          ← 全部食堂
        </Link>
      }
      title={canteen.name}
      subtitle={canteen.location ?? undefined}
    >
      <CanteenMenuView
        items={items}
        voteCounts={voteCounts}
        myVotes={myVotes}
      />
    </CanteenShell>
  );
}
