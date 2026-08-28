import { config } from "dotenv";

import type {
  ProfessorAppointmentKind,
  ProfessorCardSource,
} from "@/lib/professor-card-source";

config({ path: ".env.local" });
config({ path: ".env" });

type Options = {
  dryRun: boolean;
  limit: number | null;
  personId: string | null;
  concurrency: number;
};

function readOptions(argv: string[]): Options {
  const valueAfter = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const limitValue = valueAfter("--limit");
  const concurrencyValue = valueAfter("--concurrency");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : null;
  const concurrency = concurrencyValue
    ? Number.parseInt(concurrencyValue, 10)
    : 4;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
    throw new Error("--concurrency must be between 1 and 12");
  }
  return {
    dryRun: argv.includes("--dry-run"),
    limit,
    personId: valueAfter("--person-id") ?? null,
    concurrency,
  };
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        if (item !== undefined) await worker(item);
      }
    }),
  );
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const [{ and, eq, inArray }, { db }, schema, assets, storage] =
    await Promise.all([
      import("drizzle-orm"),
      import("@/db"),
      import("@/db/schema"),
      import("@/lib/professor-portrait-assets"),
      import("@/lib/minio"),
    ]);
  const {
    courseInstructors,
    professorPortraitAssets,
    staffPeople,
    staffPersonSources,
  } = schema;

  let people = await db
    .selectDistinct({ personId: courseInstructors.personId })
    .from(courseInstructors)
    .innerJoin(staffPeople, eq(staffPeople.id, courseInstructors.personId))
    .where(
      and(
        eq(staffPeople.identityKind, "official"),
        options.personId
          ? eq(courseInstructors.personId, options.personId)
          : undefined,
      ),
    )
    .orderBy(courseInstructors.personId);
  if (options.limit !== null) people = people.slice(0, options.limit);
  const personIds = people.map((person) => person.personId);
  if (personIds.length === 0) {
    console.log("No matching professors.");
    return;
  }

  const [sourceRows, existingRows] = await Promise.all([
    db
      .select()
      .from(staffPersonSources)
      .where(
        and(
          inArray(staffPersonSources.personId, personIds),
          eq(staffPersonSources.isCurrent, true),
        ),
      ),
    db
      .select()
      .from(professorPortraitAssets)
      .where(inArray(professorPortraitAssets.personId, personIds)),
  ]);
  const sourcesByPerson = new Map<string, ProfessorCardSource[]>();
  for (const source of sourceRows) {
    const rows = sourcesByPerson.get(source.personId) ?? [];
    rows.push({
      source: source.source,
      sourceKey: source.sourceKey,
      profileUrl: source.profileUrl,
      profileVerifiedAt: source.profileVerifiedAt,
      appointmentKind:
        source.appointmentKind as ProfessorAppointmentKind | null,
      isCurrent: source.isCurrent,
      imageUrl: source.imageUrl,
    });
    sourcesByPerson.set(source.personId, rows);
  }
  const existingByPerson = new Map(
    existingRows.map((row) => [row.personId, row]),
  );
  const counts = {
    ready: 0,
    skipped: 0,
    failed: 0,
    wouldProcess: 0,
    wouldRevalidate: 0,
  };

  if (options.dryRun) {
    for (const person of people) {
      const sources = sourcesByPerson.get(person.personId) ?? [];
      const fingerprint = assets.portraitSourceFingerprint(
        assets.selectProfessorPortraitCandidates(sources),
      );
      const existing = existingByPerson.get(person.personId);
      if (
        existing?.sourceFingerprint === fingerprint &&
        existing.webp256Key &&
        existing.webp384Key
      ) {
        counts.wouldRevalidate++;
      } else {
        counts.wouldProcess++;
      }
    }
    console.log(
      JSON.stringify({ dryRun: true, total: people.length, ...counts }),
    );
    return;
  }

  await runPool(people, options.concurrency, async ({ personId }) => {
    const sources = sourcesByPerson.get(personId) ?? [];
    const existing = existingByPerson.get(personId);
    const attemptedSourceFingerprint = assets.portraitSourceFingerprint(
      assets.selectProfessorPortraitCandidates(sources),
    );
    try {
      const pendingUpdate = assets.portraitAttemptUpdate(
        "pending",
        attemptedSourceFingerprint,
        new Date(),
      );
      await db
        .insert(professorPortraitAssets)
        .values({
          personId,
          ...pendingUpdate,
        })
        .onConflictDoUpdate({
          target: professorPortraitAssets.personId,
          set: pendingUpdate,
        });
      const result = await assets.materializeProfessorPortrait({
        personId,
        sources,
        existing: existing
          ? {
              status: existing.status as "pending" | "ready" | "failed",
              sourceFingerprint: existing.sourceFingerprint,
              materializedSourceUrl: existing.materializedSourceUrl,
              contentHash: existing.contentHash,
              webp256Key: existing.webp256Key,
              webp384Key: existing.webp384Key,
              sourceEtag: existing.sourceEtag,
              sourceLastModified: existing.sourceLastModified,
            }
          : null,
        storage: {
          put: ({ key, body, contentType, cacheControl }) =>
            storage.putPublicObject(key, body, contentType, cacheControl),
        },
      });
      const readyUpdate = assets.readyPortraitUpdate(result, new Date());
      await db
        .insert(professorPortraitAssets)
        .values({
          personId,
          ...readyUpdate,
        })
        .onConflictDoUpdate({
          target: professorPortraitAssets.personId,
          set: readyUpdate,
        });
      counts[result.kind === "ready" ? "ready" : "skipped"]++;
    } catch (error) {
      const errorCode =
        error instanceof assets.PortraitMaterializationError
          ? error.code
          : "unexpected_error";
      const failedUpdate = assets.portraitAttemptUpdate(
        "failed",
        attemptedSourceFingerprint,
        new Date(),
        errorCode,
      );
      await db
        .insert(professorPortraitAssets)
        .values({
          personId,
          ...failedUpdate,
        })
        .onConflictDoUpdate({
          target: professorPortraitAssets.personId,
          set: failedUpdate,
        });
      counts.failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${personId}: ${errorCode}: ${message}`);
    }
  });

  console.log(JSON.stringify({ total: people.length, ...counts }));
  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
