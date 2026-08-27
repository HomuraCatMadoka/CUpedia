import { CampusMapReadShell } from "@/components/campus-map/history-shell";
import { CampusMapNoteCreateForm } from "@/components/campus-map/map-note-create-form";

export const dynamic = "force-dynamic";

export default async function NewCampusMapNoteRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const place = Array.isArray(params.place) ? params.place[0] : params.place;
  return (
    <CampusMapReadShell
      eyebrow="NEW MAP NOTE"
      title="建立地图备注"
      description="备注只记录问题和现场资料，不会直接改写公开地点事实。"
    >
      <CampusMapNoteCreateForm initialPlaceId={place} />
    </CampusMapReadShell>
  );
}
