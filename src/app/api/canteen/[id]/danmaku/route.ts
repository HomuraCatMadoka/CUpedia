import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDanmakuAuthorForApi } from "@/lib/auth-guard";
import { insertCanteenDanmakuForUser } from "@/lib/danmaku-mutations";
import { listCurrentMonthCanteenDanmaku } from "@/lib/danmaku-queries";
import {
  isUuid,
  publicDanmakuError,
  serializePublicDanmaku,
} from "@/lib/danmaku-api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: canteenId } = await params;
  if (!isUuid(canteenId)) {
    return NextResponse.json({ error: "INVALID_CANTEEN_ID" }, { status: 400 });
  }
  const messages = await listCurrentMonthCanteenDanmaku(canteenId);
  return NextResponse.json({
    messages: messages.map(serializePublicDanmaku),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: canteenId } = await params;
  if (!isUuid(canteenId)) {
    return NextResponse.json({ error: "INVALID_CANTEEN_ID" }, { status: 400 });
  }
  const author = await getDanmakuAuthorForApi();
  if (!author) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (author.banned) {
    return NextResponse.json({ error: "USER_BANNED" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const body = raw as { content?: unknown };

  try {
    const message = await insertCanteenDanmakuForUser(
      { id: author.id, nickname: author.nickname },
      canteenId,
      body.content,
    );
    revalidatePath(`/canteen/${canteenId}`);
    return NextResponse.json(
      {
        message: serializePublicDanmaku(message),
      },
      { status: 201 },
    );
  } catch (e) {
    const failure = publicDanmakuError(e);
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }
}
