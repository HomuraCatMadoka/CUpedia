/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContributorSetupProvider,
  useContributorSetup,
} from "@/components/auth/contributor-setup-provider";

const mockFetch = vi.fn();

function PublishHarness() {
  const { ensureContributorSetup } = useContributorSetup();
  return (
    <button
      onClick={async () => {
        if (await ensureContributorSetup()) {
          document.body.dataset.published = "yes";
        }
      }}
    >
      发布
    </button>
  );
}

function ConcurrentPublishHarness() {
  const { ensureContributorSetup } = useContributorSetup();
  const publish = async (key: "first" | "second") => {
    if (await ensureContributorSetup()) document.body.dataset[key] = "yes";
  };
  return (
    <>
      <button onClick={() => publish("first")}>发布一</button>
      <button onClick={() => publish("second")}>发布二</button>
    </>
  );
}

describe("ContributorSetupProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete document.body.dataset.published;
    delete document.body.dataset.first;
    delete document.body.dataset.second;
    vi.stubGlobal("fetch", mockFetch);
  });

  it("does not interrupt a contributor whose account is complete", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        complete: true,
        needs: { nickname: false, password: false },
      }),
    });
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(document.body.dataset.published).toBe("yes"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pauses the original action until every missing field is completed", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          complete: false,
          needs: { nickname: true, password: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          complete: true,
          needs: { nickname: false, password: false },
        }),
      });
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(document.body.dataset.published).toBeUndefined();
    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "完整用户" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成并继续" }));

    await waitFor(() => expect(document.body.dataset.published).toBe("yes"));
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/auth/account-setup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          nickname: "完整用户",
          password: "password123",
        }),
      }),
    );
  });

  it("only asks for fields that are actually missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        complete: false,
        needs: { nickname: false, password: true },
      }),
    });
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByLabelText("新密码")).toBeTruthy();
    expect(screen.queryByLabelText("昵称")).toBeNull();
  });

  it("asks for only a nickname when a credential account already exists", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        complete: false,
        needs: { nickname: true, password: false },
      }),
    });
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByLabelText("昵称")).toBeTruthy();
    expect(screen.queryByLabelText("新密码")).toBeNull();
  });

  it("cancels without publishing and asks again only on the next attributed action", async () => {
    const incomplete = {
      ok: true,
      json: async () => ({
        complete: false,
        needs: { nickname: true, password: false },
      }),
    };
    mockFetch
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(incomplete);
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    fireEvent.click(await screen.findByRole("button", { name: "稍后再说" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.dataset.published).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not submit mismatched password confirmation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        complete: false,
        needs: { nickname: false, password: true },
      }),
    });
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    fireEvent.change(await screen.findByLabelText("新密码"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成并继续" }));

    expect(await screen.findByText("两次输入的密码不一致")).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(document.body.dataset.published).toBeUndefined();
  });

  it("resumes every action waiting on the same completion dialog", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          complete: false,
          needs: { nickname: true, password: false },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          complete: true,
          needs: { nickname: false, password: false },
        }),
      });
    render(
      <ContributorSetupProvider>
        <ConcurrentPublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布一" }));
    fireEvent.click(screen.getByRole("button", { name: "发布二" }));
    fireEvent.change(await screen.findByLabelText("昵称"), {
      target: { value: "完整用户" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成并继续" }));

    await waitFor(() => expect(document.body.dataset.first).toBe("yes"));
    expect(document.body.dataset.second).toBe("yes");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the status check is temporarily unavailable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    expect(document.body.dataset.published).toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the draft paused and shows an error when completion cannot be saved", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          complete: false,
          needs: { nickname: true, password: false },
        }),
      })
      .mockRejectedValueOnce(new Error("network down"));
    render(
      <ContributorSetupProvider>
        <PublishHarness />
      </ContributorSetupProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    fireEvent.change(await screen.findByLabelText("昵称"), {
      target: { value: "完整用户" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成并继续" }));

    expect(await screen.findByText("保存失败，请重试")).toBeTruthy();
    expect(document.body.dataset.published).toBeUndefined();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
