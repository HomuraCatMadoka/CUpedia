import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { processCampusMapPlacePhoto } from "@/lib/campus-map/place-photos";
import { CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES } from "@/lib/campus-map/place-photos-contract";

describe("Campus Map Place photo processing (#818)", () => {
  it("auto-rotates, strips source metadata, bounds dimensions, and emits WebP derivatives", async () => {
    const source = await sharp({
      create: {
        width: 2_400,
        height: 1_200,
        channels: 3,
        background: "#176346",
      },
    })
      .jpeg({ quality: 92 })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const processed = await processCampusMapPlacePhoto(source);
    const [full, thumbnail] = await Promise.all([
      sharp(processed.full.body).metadata(),
      sharp(processed.thumbnail.body).metadata(),
    ]);

    expect(processed.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(full).toMatchObject({ format: "webp", width: 800, height: 1600 });
    expect(thumbnail).toMatchObject({
      format: "webp",
      width: 160,
      height: 320,
    });
    expect(full.orientation).toBeUndefined();
    expect(full.exif).toBeUndefined();
    expect(processed.full.body.byteLength).toBeLessThanOrEqual(
      CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES,
    );
  });

  it.each([
    [Buffer.alloc(0), "photo-empty"],
    [
      Buffer.alloc(CAMPUS_MAP_PLACE_PHOTO_MAX_FILE_BYTES + 1),
      "photo-too-large",
    ],
    [Buffer.from("not an image"), "photo-type-unsupported"],
  ])(
    "rejects invalid bytes with an actionable safe code",
    async (source, code) => {
      await expect(processCampusMapPlacePhoto(source)).rejects.toMatchObject({
        code,
      });
    },
  );

  it("rejects an otherwise valid raster with an excessive edge", async () => {
    const source = await sharp({
      create: {
        width: 12_001,
        height: 1,
        channels: 3,
        background: "white",
      },
    })
      .jpeg()
      .toBuffer();
    await expect(processCampusMapPlacePhoto(source)).rejects.toMatchObject({
      code: "photo-dimensions-too-large",
    });
  });
});
