import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetCanteenMockState } from "@/lib/canteen-mock";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("canteen-preview-actions", () => {
  const prevMock = process.env.CANTEEN_MOCK_DATA;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.CANTEEN_MOCK_DATA = "true";
    vi.stubEnv("NODE_ENV", "development");
    resetCanteenMockState();
  });

  afterEach(() => {
    process.env.CANTEEN_MOCK_DATA = prevMock;
    vi.stubEnv("NODE_ENV", prevNodeEnv);
    resetCanteenMockState();
  });

  it("creates a canteen in preview without admin auth", async () => {
    const { previewCreateCanteen } = await import("@/lib/canteen-preview-actions");
    const { getCanteens } = await import("@/lib/canteen-actions");

    const created = await previewCreateCanteen({
      name: "预览食堂",
      location: "CWB",
    });

    const all = await getCanteens();
    expect(all.some((c) => c.id === created.id && c.name === "预览食堂")).toBe(
      true,
    );
  });

  it("rejects preview actions outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { previewCreateCanteen } = await import("@/lib/canteen-preview-actions");

    await expect(
      previewCreateCanteen({ name: "非法" }),
    ).rejects.toThrow("PREVIEW_UNAVAILABLE");
  });

  it("reports delete impact for canteen menu items", async () => {
    const { previewGetCanteenDeleteImpact } = await import(
      "@/lib/canteen-preview-actions"
    );
    const { getCanteens } = await import("@/lib/canteen-actions");

    const canteen = (await getCanteens())[0];
    const impact = await previewGetCanteenDeleteImpact(canteen.id);

    expect(impact.menuItemCount).toBeGreaterThan(0);
    expect(impact.voteCount).toBe(0);
    expect(impact.commentCount).toBe(0);
  });
});
