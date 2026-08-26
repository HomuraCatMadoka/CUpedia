import { NextResponse } from "next/server";

import {
  closeCusisPrototypeSession,
  cusisPrototypeDatasets,
  getCusisPrototypeStatus,
  readCusisCoursesPrototype,
  startCusisPrototypeSession,
  type CusisPrototypeDataset,
} from "@/lib/cusis-prototype-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await getCusisPrototypeStatus());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    return NextResponse.json(await startCusisPrototypeSession());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      dataset?: unknown;
      closeAfterRead?: unknown;
    } | null;
    if (body?.dataset === "all") {
      try {
        const results = [];
        for (const dataset of cusisPrototypeDatasets) {
          results.push(await readCusisCoursesPrototype(dataset, false));
        }
        return NextResponse.json({ results });
      } finally {
        await closeCusisPrototypeSession();
      }
    }

    const dataset = cusisPrototypeDatasets.includes(
      body?.dataset as CusisPrototypeDataset,
    )
      ? (body?.dataset as CusisPrototypeDataset)
      : "current";
    return NextResponse.json(
      await readCusisCoursesPrototype(dataset, body?.closeAfterRead !== false),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await closeCusisPrototypeSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
