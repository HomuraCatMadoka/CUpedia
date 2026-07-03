import { NextRequest, NextResponse } from "next/server";
import { upsertDishVote } from "@/lib/canteen-vote-actions";
import { parseVote } from "@/lib/canteen-types";

function mapVoteError(message: string): number {
  switch (message) {
    case "RATE_LIMIT_EXCEEDED":
      return 429;
    case "ANON_SESSION_REQUIRED":
      return 403;
    case "USER_BANNED":
      return 403;
    case "MENU_ITEM_NOT_FOUND":
      return 404;
    case "INVALID_VOTE":
      return 400;
    default:
      return 500;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  let body: { vote?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!("vote" in body)) {
    return NextResponse.json({ error: "INVALID_VOTE" }, { status: 400 });
  }

  let vote;
  try {
    vote = parseVote(body.vote);
  } catch {
    return NextResponse.json({ error: "INVALID_VOTE" }, { status: 400 });
  }

  try {
    const result = await upsertDishVote(itemId, vote);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "VOTE_FAILED";
    return NextResponse.json(
      { error: message },
      { status: mapVoteError(message) },
    );
  }
}
