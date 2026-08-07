/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPush, mockEnsureContributorSetup, navigation } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockEnsureContributorSetup: vi.fn().mockResolvedValue(true),
  navigation: { pathname: "/wiki" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/components/auth/contributor-setup-provider", () => ({
  useContributorSetup: () => ({
    ensureContributorSetup: mockEnsureContributorSetup,
  }),
}));

import { WikiCreateButton } from "@/components/wiki/wiki-create-button";

describe("WikiCreateButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    mockEnsureContributorSetup.mockResolvedValue(true);
    navigation.pathname = "/wiki";
  });

  it("opens a private client draft without creating a public page", async () => {
    render(<WikiCreateButton parentId="parent-1">新建</WikiCreateButton>);

    const button = screen.getByRole("button", { name: "新建" });
    expect(button.getAttribute("href")).toBe(
      "/wiki/new?draft=1&parent=parent-1",
    );
    fireEvent.click(button);

    await waitFor(() => expect(mockPush).toHaveBeenCalledOnce());
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringMatching(/^\/wiki\/[0-9a-f-]+\?draft=1&parent=parent-1$/),
    );
  });

  it("creates a page when the button is activated with Space", () => {
    render(<WikiCreateButton>新建</WikiCreateButton>);

    fireEvent.keyDown(screen.getByRole("button", { name: "新建" }), {
      key: " ",
    });

    expect(mockPush).toHaveBeenCalledOnce();
  });

  it("navigates immediately and only once while contributor setup is pending", async () => {
    let completeSetup!: (complete: boolean) => void;
    mockEnsureContributorSetup.mockReturnValue(
      new Promise<boolean>((resolve) => {
        completeSetup = resolve;
      }),
    );
    render(<WikiCreateButton>新建</WikiCreateButton>);

    const button = screen.getByRole("button", { name: "新建" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(mockEnsureContributorSetup).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledOnce();

    completeSetup(true);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("does not allow a second page when eager persistence fails before navigation commits", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(<WikiCreateButton>新建</WikiCreateButton>);

    const button = screen.getByRole("button", { name: "新建" });
    fireEvent.click(button);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    fireEvent.click(button);

    expect(mockPush).toHaveBeenCalledOnce();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("allows another page after the first navigation commits", async () => {
    const { rerender } = render(<WikiCreateButton>新建</WikiCreateButton>);

    const button = screen.getByRole("button", { name: "新建" });
    fireEvent.click(button);
    const firstDestination = mockPush.mock.calls[0]![0] as string;
    navigation.pathname = new URL(
      firstDestination,
      "https://example.test",
    ).pathname;
    rerender(<WikiCreateButton>新建</WikiCreateButton>);

    fireEvent.click(button);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });
});
