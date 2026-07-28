import { KEYS } from "platejs";
import { describe, expect, it } from "vitest";

import { buildMediaUrlNode } from "@/components/editor/media-url";

describe("media URL nodes", () => {
  it("keeps direct video files as native video nodes", () => {
    expect(
      buildMediaUrlNode(KEYS.video, "https://cdn.example.com/lecture.mp4"),
    ).toMatchObject({
      type: KEYS.video,
      url: "https://cdn.example.com/lecture.mp4",
    });
  });

  it("normalizes provider video URLs to media embeds", () => {
    expect(
      buildMediaUrlNode(KEYS.video, "https://vimeo.com/123456789"),
    ).toMatchObject({
      id: "123456789",
      provider: "vimeo",
      sourceUrl: "https://vimeo.com/123456789",
      type: KEYS.mediaEmbed,
      url: "https://player.vimeo.com/video/123456789",
    });
  });
});
