import { notFound } from "next/navigation";

import { CampusMapChangesetPage } from "@/components/campus-map/history-shell";
import { getCampusMapChangeset } from "@/lib/campus-map/fact-store";

export const dynamic = "force-dynamic";

export default async function CampusMapChangesetRoute({
  params,
}: {
  params: Promise<{ changesetId: string }>;
}) {
  const { changesetId } = await params;
  const changeset = await getCampusMapChangeset(changesetId);
  if (!changeset) notFound();
  return <CampusMapChangesetPage changeset={changeset} />;
}
