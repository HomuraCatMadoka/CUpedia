/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssign,
  mockConfirm,
  mockEnsureContributorSetup,
  mockPreloadWikiEditor,
  mockProjectUpsert,
  mockRollback,
  navigation,
} = vi.hoisted(() => ({
  mockAssign: vi.fn(),
  mockConfirm: vi.fn(),
  mockEnsureContributorSetup: vi.fn().mockResolvedValue(true),
  mockPreloadWikiEditor: vi.fn(),
  mockProjectUpsert: vi.fn(() => "mutation-1"),
  mockRollback: vi.fn(),
  navigation: { pathname: "/wiki" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@/lib/document-navigation", () => ({
  navigateDocument: mockAssign,
}));

vi.mock("@/components/auth/contributor-setup-provider", () => ({
  useContributorSetup: () => ({
    ensureContributorSetup: mockEnsureContributorSetup,
  }),
}));

vi.mock("@/components/wiki/wiki-tree-provider", () => ({
  useOptionalWikiTree: () => ({
    projectUpsert: mockProjectUpsert,
    confirm: mockConfirm,
    rollback: mockRollback,
  }),
}));

vi.mock("@/components/wiki/wiki-editor-lazy", () => ({
  preloadWikiEditor: mockPreloadWikiEditor,
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
    expect(button.getAttribute("data-client-ready")).toBe("true");
    expect(mockPreloadWikiEditor).toHaveBeenCalledOnce();
    expect(button.getAttribute("href")).toBe(
      "/wiki/new?draft=1&parent=parent-1",
    );
    fireEvent.click(button);

    await waitFor(() => expect(mockAssign).toHaveBeenCalledOnce());
    expect(mockConfirm).toHaveBeenCalledWith("mutation-1");
    expect(mockRollback).not.toHaveBeenCalled();
    expect(mockAssign).toHaveBeenCalledWith(
      expect.stringMatching(/^\/wiki\/[0-9a-f-]+\?draft=1&parent=parent-1$/),
    );
  });

  it("creates a page when the button is activated with Space", async () => {
    render(<WikiCreateButton>新建</WikiCreateButton>);

    fireEvent.keyDown(screen.getByRole("button", { name: "新建" }), {
      key: " ",
    });

    await waitFor(() => expect(mockAssign).toHaveBeenCalledOnce());
  });

  it("persists before navigating and ignores duplicate activation", async () => {
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
    expect(mockAssign).not.toHaveBeenCalled();

    completeSetup(true);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockAssign).toHaveBeenCalledOnce());
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("allows retry when draft persistence fails", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    render(<WikiCreateButton>新建</WikiCreateButton>);

    const button = screen.getByRole("button", { name: "新建" });
    fireEvent.click(button);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    fireEvent.click(button);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalledTimes(2);
    expect(mockRollback).toHaveBeenNthCalledWith(1, "mutation-1");
    expect(mockRollback).toHaveBeenNthCalledWith(2, "mutation-1");
    expect(mockAssign).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("ignores duplicate activation while document navigation is pending", async () => {
    render(<WikiCreateButton>新建</WikiCreateButton>);

    const button = screen.getByRole("button", { name: "新建" });
    fireEvent.click(button);
    await waitFor(() => expect(mockAssign).toHaveBeenCalledOnce());
    fireEvent.click(button);
    expect(mockAssign).toHaveBeenCalledOnce();
  });

  it("does not resume stale creation after the user navigates away", async () => {
    let completeSetup!: (complete: boolean) => void;
    mockEnsureContributorSetup.mockReturnValue(
      new Promise<boolean>((resolve) => {
        completeSetup = resolve;
      }),
    );
    const { rerender } = render(<WikiCreateButton>新建</WikiCreateButton>);

    const button = screen.getByRole("button", { name: "新建" });
    fireEvent.click(button);
    navigation.pathname = "/courses";
    rerender(<WikiCreateButton>新建</WikiCreateButton>);
    completeSetup(true);

    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalledWith("mutation-1");
    expect(fetch).not.toHaveBeenCalled();
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("keeps a persisted draft when navigation becomes stale", async () => {
    let completeRequest!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        completeRequest = resolve;
      }) as Promise<Response>,
    );
    const { rerender } = render(<WikiCreateButton>新建</WikiCreateButton>);

    fireEvent.click(screen.getByRole("button", { name: "新建" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    navigation.pathname = "/courses";
    rerender(<WikiCreateButton>新建</WikiCreateButton>);
    completeRequest({ ok: true } as Response);

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith("mutation-1"));
    expect(mockRollback).not.toHaveBeenCalled();
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("navigates when onCreated closes its container", async () => {
    const view = render(
      <WikiCreateButton onCreated={() => view.rerender(<div>closed</div>)}>
        新建
      </WikiCreateButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "新建" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockAssign).toHaveBeenCalledOnce());
    expect(screen.getByText("closed")).toBeTruthy();
    expect(mockConfirm).toHaveBeenCalledWith("mutation-1");
    expect(mockRollback).not.toHaveBeenCalled();
  });
});
