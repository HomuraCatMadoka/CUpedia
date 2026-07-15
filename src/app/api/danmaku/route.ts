import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDanmakuAuthorForApi } from "@/lib/auth-guard";
import { insertDanmakuForUser } from "@/lib/danmaku-mutations";
import { listCurrentMonthDanmaku } from "@/lib/danmaku-queries";

function mapDanmakuError(message: string): number {
  switch (message) {
    case "INVALID_DANMAKU":
    case "DANMAKU_BLOCKED":
    case "SENSITIVE_CONTENT":
      return 400;
    case "DANMAKU_RATE_LIMIT_EXCEEDED":
      return 429;
    default:
      return 500;
  }
}

export async function GET() {
  const messages = await listCurrentMonthDanmaku();
  return NextResponse.json({
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const author = await getDanmakuAuthorForApi();
  if (!author) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (author.banned) {
    return NextResponse.json({ error: "USER_BANNED" }, { status: 403 });
  }

  let body: { content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const message = await insertDanmakuForUser(
      { id: author.id, nickname: author.nickname },
      body.content,
    );
    revalidatePath("/");
    return NextResponse.json(
      {
        message: {
          ...message,
          createdAt: message.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (e) {
    const code = e instanceof Error ? e.message : "DANMAKU_FAILED";
    return NextResponse.json(
      { error: code },
      { status: mapDanmakuError(code) },
    );
  }
}
