import { NextResponse } from "next/server";

import { createWikiDraft } from "@/lib/wiki-draft-actions";

export async function POST(request: Request) {
  try {
    const { id, parentId } = (await request.json()) as {
      id: string;
      parentId?: string | null;
    };
    const draft = await createWikiDraft({ id, parentId });
    return NextResponse.json({ id: draft.id });
  } catch {
    return NextResponse.json(
      { error: "Unable to create private page" },
      { status: 400 },
    );
  }
}
