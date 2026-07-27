/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateWikiPage, mockPush, mockEnsureContributorSetup } = vi.hoisted(
  () => ({
    mockCreateWikiPage: vi.fn(),
    mockPush: vi.fn(),
    mockEnsureContributorSetup: vi.fn().mockResolvedValue(true),
  }),
);

vi.mock("@/lib/wiki-actions", () => ({
  createWikiPage: mockCreateWikiPage,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/components/auth/contributor-setup-provider", () => ({
  useContributorSetup: () => ({
    ensureContributorSetup: mockEnsureContributorSetup,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { WikiCreateButton } from "@/components/wiki/wiki-create-button";

describe("WikiCreateButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureContributorSetup.mockResolvedValue(true);
    mockCreateWikiPage.mockImplementation(async ({ id }: { id: string }) => ({
      id,
    }));
  });

  it("creates an untitled page with a client UUID and opens its canonical route", async () => {
    render(<WikiCreateButton parentId="parent-1">新建</WikiCreateButton>);

    fireEvent.click(screen.getByRole("button", { name: "新建" }));

    await waitFor(() => expect(mockCreateWikiPage).toHaveBeenCalledOnce());
    const input = mockCreateWikiPage.mock.calls[0]![0] as {
      id: string;
      parentId: string;
    };
    expect(input.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(input.parentId).toBe("parent-1");
    expect(mockPush).toHaveBeenCalledWith(`/wiki/${input.id}`);
  });

  it("reuses the same client UUID when a failed create is retried", async () => {
    mockCreateWikiPage
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementationOnce(async ({ id }: { id: string }) => ({ id }));
    render(<WikiCreateButton>新建</WikiCreateButton>);

    fireEvent.click(screen.getByRole("button", { name: "新建" }));
    await waitFor(() => expect(mockCreateWikiPage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "新建" }));
    await waitFor(() => expect(mockCreateWikiPage).toHaveBeenCalledTimes(2));

    expect(mockCreateWikiPage.mock.calls[1]![0].id).toBe(
      mockCreateWikiPage.mock.calls[0]![0].id,
    );
  });
});
