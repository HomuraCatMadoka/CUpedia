/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlacePhotoEditor } from "@/components/campus-map/place-photo-editor";

const assetId = "30000000-0000-4000-8000-000000000818";

beforeEach(() => {
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(assetId);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "uploaded",
          asset: {
            id: assetId,
            url: `/api/campus-map/place-photos/${assetId}/full`,
            thumbnailUrl: `/api/campus-map/place-photos/${assetId}/thumbnail`,
            width: 1200,
            height: 800,
            thumbnailWidth: 480,
            thumbnailHeight: 320,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PlacePhotoEditor (#818)", () => {
  it("uploads a Place photo and uses a pin-type-aware default role", async () => {
    const onChange = vi.fn();
    render(
      <PlacePhotoEditor pinType="classroom" photos={[]} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText("添加照片（0/3）"), {
      target: {
        files: [new File(["photo"], "room.png", { type: "image/png" })],
      },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ assetId, role: "entrance" }),
    ]);
    const body = (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit)
      .body as FormData;
    expect(body.get("assetId")).toBe(assetId);
    expect(body.get("photo")).toBeInstanceOf(File);
  });

  it("shows the shared three-photo cap and privacy guidance", () => {
    const photos = ["1", "2", "3"].map((suffix, index) => ({
      assetId: `30000000-0000-4000-8000-00000000081${suffix}`,
      role: (["entrance", "accessibility", "overview"] as const)[index],
      width: 1200,
      height: 800,
      thumbnailWidth: 480,
      thumbnailHeight: 320,
    }));
    render(
      <PlacePhotoEditor pinType="toilet" photos={photos} onChange={vi.fn()} />,
    );
    expect(screen.getByText(/避开可识别的人脸/u)).toBeTruthy();
    expect(screen.getByText("已达到 3 张上限")).toBeTruthy();
  });

  it("lets the user reorder photos so the first thumbnail stays the cover", () => {
    const photos = [
      {
        assetId: "30000000-0000-4000-8000-000000000811",
        role: "entrance" as const,
      },
      {
        assetId: "30000000-0000-4000-8000-000000000812",
        role: "interior" as const,
      },
    ];
    const onChange = vi.fn();
    render(
      <PlacePhotoEditor
        pinType="classroom"
        photos={photos}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("将第 2 张地点照片前移"));
    expect(onChange).toHaveBeenCalledWith([photos[1], photos[0]]);
  });

  it("tells the user how to recover from a corrupt image", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "validation-failed",
          code: "photo-processing-failed",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(
      <PlacePhotoEditor pinType="classroom" photos={[]} onChange={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("添加照片（0/3）"), {
      target: {
        files: [new File(["corrupt"], "room.png", { type: "image/png" })],
      },
    });

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /重新导出|另一张/u,
    );
  });

  it("compensates an upload whose response is lost", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("network disconnected"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    render(
      <PlacePhotoEditor pinType="classroom" photos={[]} onChange={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("添加照片（0/3）"), {
      target: {
        files: [new File(["photo"], "room.png", { type: "image/png" })],
      },
    });

    await screen.findByRole("alert");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[1]).toEqual([
      "/api/campus-map/place-photos",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ assetIds: [assetId] }),
        keepalive: true,
      }),
    ]);
  });
});
