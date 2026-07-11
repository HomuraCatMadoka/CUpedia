"use server";

import { db } from "@/db";
import { buildItems, builds } from "@/db/schema";
import { requireAuth } from "@/lib/auth-guard";
import { and, desc, eq } from "drizzle-orm";

export type BuildInput = {
  majorId: string;
  name: string;
  mode: "free" | "strict";
  items: { code: string; term?: number | null }[];
};

export type SavedBuild = BuildInput & { id: string };

export type BuildSummary = Omit<SavedBuild, "items">;

export async function listMyBuilds(): Promise<BuildSummary[]> {
  const user = await requireAuth();
  const rows = await db.query.builds.findMany({
    where: eq(builds.userId, user.id),
    columns: { id: true, majorId: true, name: true, mode: true },
    orderBy: desc(builds.updatedAt),
  });
  return rows.map((row) => ({
    ...row,
    mode: row.mode as BuildInput["mode"],
  }));
}

export async function loadBuild(id: string): Promise<SavedBuild | null> {
  const user = await requireAuth();
  const build = await db.query.builds.findFirst({
    where: and(eq(builds.id, id), eq(builds.userId, user.id)),
    columns: { id: true, majorId: true, name: true, mode: true },
    with: { items: { columns: { courseCode: true, term: true } } },
  });
  if (!build) return null;
  return {
    id: build.id,
    majorId: build.majorId,
    name: build.name,
    mode: build.mode as BuildInput["mode"],
    items: build.items.map((item) => ({
      code: item.courseCode,
      term: item.term,
    })),
  };
}

export async function saveBuild(input: BuildInput): Promise<string> {
  const user = await requireAuth();
  const name = input.name.trim();
  if (!name) throw new Error("BUILD_NAME_REQUIRED");
  if (
    input.mode === "strict" &&
    input.items.some(
      (item) => !Number.isInteger(item.term) || Number(item.term) < 1,
    )
  ) {
    throw new Error("BUILD_TERM_REQUIRED");
  }

  return db.transaction(async (tx) => {
    const [build] = await tx
      .insert(builds)
      .values({
        userId: user.id,
        majorId: input.majorId,
        name,
        mode: input.mode,
      })
      .returning({ id: builds.id });

    if (input.items.length) {
      await tx.insert(buildItems).values(
        input.items.map((item) => ({
          buildId: build.id,
          courseCode: item.code,
          term: input.mode === "strict" ? item.term : null,
        })),
      );
    }
    return build.id;
  });
}
