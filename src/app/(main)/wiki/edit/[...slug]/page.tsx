import { notFound, redirect } from "next/navigation";
import { requireEditorOrRedirect } from "@/lib/auth-guard";
import { getWikiPageForEdit } from "@/lib/wiki-actions";

export default async function EditWikiPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  await requireEditorOrRedirect();
  const { slug: slugParts } = await params;
  const identifier = slugParts.map(decodeURIComponent).join("/");
  const page = await getWikiPageForEdit(identifier);
  if (!page) notFound();
  redirect(`/wiki/${page.id}`);
}
