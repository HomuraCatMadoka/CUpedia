import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  CampusMapPlacePhotoError,
  cleanupCampusMapPlacePhotoAssets,
  uploadCampusMapPlacePhoto,
} from "@/lib/campus-map/place-photos";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)(
  "Campus Map Place photo storage lifecycle (#818)",
  () => {
    let pool: Pool;
    const actorIds: string[] = [];

    beforeAll(() => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
    });

    afterEach(async () => {
      if (actorIds.length === 0) return;
      await pool.query(
        "delete from campus_map_place_photo_assets where owner_user_id = any($1::uuid[])",
        [actorIds],
      );
      await pool.query(
        "delete from campus_map_place_photo_upload_limits where actor_user_id = any($1::uuid[])",
        [actorIds],
      );
      await pool.query("delete from users where id = any($1::uuid[])", [
        actorIds,
      ]);
      actorIds.length = 0;
    });

    afterAll(async () => {
      await pool.end();
    });

    async function createActor() {
      const actorId = randomUUID();
      actorIds.push(actorId);
      await pool.query(
        `insert into users (id, email, email_verified, nickname)
       values ($1, $2, true, '照片贡献者')`,
        [actorId, `campus-map-photo-${actorId}@cuhk.edu.hk`],
      );
      return actorId;
    }

    async function sourcePhoto() {
      return sharp({
        create: {
          width: 24,
          height: 16,
          channels: 3,
          background: "#176346",
        },
      })
        .jpeg()
        .toBuffer();
    }

    it("makes duplicate upload attempts idempotent without writing objects twice", async () => {
      const actorId = await createActor();
      const assetId = randomUUID();
      const source = await sourcePhoto();
      const storedKeys: string[] = [];
      const putStoredObject = async (key: string) => {
        storedKeys.push(key);
      };

      const first = await uploadCampusMapPlacePhoto({
        actorId,
        assetId,
        source,
        now: new Date("2026-09-02T01:00:00.000Z"),
        putStoredObject,
      });
      const replay = await uploadCampusMapPlacePhoto({
        actorId,
        assetId,
        source,
        now: new Date("2026-09-02T01:01:00.000Z"),
        putStoredObject,
      });

      expect(replay).toEqual(first);
      expect(storedKeys).toEqual([
        `campus-map/place-photos/${assetId}/full.webp`,
        `campus-map/place-photos/${assetId}/thumbnail.webp`,
      ]);
      const limit = await pool.query<{ attempt_count: number }>(
        `select attempt_count
         from campus_map_place_photo_upload_limits
        where actor_user_id = $1`,
        [actorId],
      );
      expect(limit.rows[0]?.attempt_count).toBe(2);
    });

    it("expires a partial upload and removes both object keys on cleanup retry", async () => {
      const actorId = await createActor();
      const assetId = randomUUID();
      const source = await sourcePhoto();
      let putCount = 0;
      await expect(
        uploadCampusMapPlacePhoto({
          actorId,
          assetId,
          source,
          now: new Date("2026-09-02T02:00:00.000Z"),
          putStoredObject: async () => {
            putCount += 1;
            if (putCount === 2) throw new Error("simulated storage failure");
          },
        }),
      ).rejects.toEqual(new CampusMapPlacePhotoError("photo-upload-failed"));

      const deletedKeys: string[] = [];
      await expect(
        cleanupCampusMapPlacePhotoAssets({
          now: new Date("2026-09-02T02:00:01.000Z"),
          deleteStoredObjects: async (keys) => {
            deletedKeys.push(...keys);
          },
        }),
      ).resolves.toEqual({ deleted: 1 });
      expect(deletedKeys).toEqual([
        `campus-map/place-photos/${assetId}/full.webp`,
        `campus-map/place-photos/${assetId}/thumbnail.webp`,
      ]);
    });

    it("rejects the nineteenth upload attempt inside one hour", async () => {
      const actorId = await createActor();
      const source = await sourcePhoto();
      const now = new Date("2026-09-02T03:00:00.000Z");
      for (let index = 0; index < 18; index += 1) {
        await uploadCampusMapPlacePhoto({
          actorId,
          assetId: randomUUID(),
          source,
          now,
          putStoredObject: async () => undefined,
        });
      }

      await expect(
        uploadCampusMapPlacePhoto({
          actorId,
          assetId: randomUUID(),
          source,
          now,
          putStoredObject: async () => undefined,
        }),
      ).rejects.toEqual(
        new CampusMapPlacePhotoError("photo-upload-rate-limited"),
      );
    });
  },
);
