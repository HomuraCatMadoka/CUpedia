/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const {
  achievementNoticeCount,
  markAchievementNoticesSeen,
  push,
  refresh,
  sessionState,
  signOut,
  toastError,
  mountedState,
} = vi.hoisted(() => ({
  achievementNoticeCount: vi.fn(),
  markAchievementNoticesSeen: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  sessionState: {
    current: {
      user: { email: "user@test.com", nickname: "TestUser", role: "user" },
    } as { user: Record<string, unknown> } | null,
  },
  signOut: vi.fn(),
  toastError: vi.fn(),
  mountedState: { current: true },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/courses",
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: sessionState.current,
    }),
    signOut,
  },
}));

vi.mock("@/hooks/use-mounted", () => ({
  useMounted: () => mountedState.current,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

vi.mock("@/lib/achievement-notice-actions", () => ({
  getAchievementNoticeCount: achievementNoticeCount,
  markAchievementNoticesSeen,
}));

vi.mock("@/components/layout/command-search", () => ({
  CommandSearch: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <button
      onClick={() => onOpenChange(!open)}
      aria-label="搜索"
      data-open={String(open)}
    >
      搜索
    </button>
  ),
}));

vi.mock("@/components/layout/mobile-product-menu", () => ({
  MobileProductMenu: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <button
      onClick={() => onOpenChange(!open)}
      aria-label="产品菜单"
      data-open={String(open)}
    >
      产品菜单
    </button>
  ),
}));

vi.mock("@/components/layout/notification-center", () => ({
  NotificationCenter: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) => (
    <button
      onClick={() => onOpenChange(!open)}
      aria-label="通知"
      data-open={String(open)}
    >
      通知
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuRadioItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

import { Navbar } from "@/components/layout/navbar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { AchievementNoticesSeen } from "@/components/courses/achievement-notices-seen";

function renderWithShell(ui: React.ReactNode = <Navbar />) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SidebarProvider initialCollapsed={false}>{children}</SidebarProvider>
    ),
  });
}

describe("Navbar sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    signOut.mockResolvedValue({ error: null });
    achievementNoticeCount.mockResolvedValue(0);
    markAchievementNoticesSeen.mockResolvedValue(undefined);
    mountedState.current = true;
    sessionState.current = {
      user: { email: "user@test.com", nickname: "TestUser", role: "user" },
    };
  });

  it("navigates to login and refreshes after sign-out succeeds", async () => {
    let completeSignOut!: (result: { error: null }) => void;
    signOut.mockReturnValue(
      new Promise((resolve) => {
        completeSignOut = resolve;
      }),
    );
    renderWithShell();

    fireEvent.click(screen.getByRole("button", { name: "登出" }));

    expect(
      (
        screen.getByRole("button", {
          name: "登出中...",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => completeSignOut({ error: null }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the user in place and reports a sign-out failure", async () => {
    signOut.mockResolvedValue({ error: { message: "请求失败" } });
    renderWithShell();

    fireEvent.click(screen.getByRole("button", { name: "登出" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("请求失败"));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers global links to personal course pages", () => {
    renderWithShell();

    fireEvent.click(screen.getByRole("button", { name: "我的测评" }));
    expect(push).toHaveBeenCalledWith("/courses/my-reviews");

    fireEvent.click(screen.getByRole("button", { name: "我的成就" }));
    expect(push).toHaveBeenCalledWith("/courses/achievements");
  });

  it("labels the CU Bus entry as testing and links to the route list", () => {
    renderWithShell();

    expect(
      screen
        .getByRole("link", { name: "CU Bus · 測試中" })
        .getAttribute("href"),
    ).toBe("/campus-bus");
  });

  it("offers a public product updates entry", () => {
    renderWithShell();

    expect(
      screen.getByRole("link", { name: "产品更新" }).getAttribute("href"),
    ).toBe("/updates");
  });

  it("reserves stable notification and account slots during hydration and logout", () => {
    mountedState.current = false;
    const { rerender } = renderWithShell();

    expect(screen.getByTestId("notification-slot").className).toContain(
      "size-11",
    );
    const hydratingAccountSlot = screen.getByTestId("account-slot");
    const stableAccountSlotClassName = hydratingAccountSlot.className;
    expect(hydratingAccountSlot.className).toContain("size-11");
    expect(hydratingAccountSlot.className).toContain("md:w-[4.5rem]");
    expect(hydratingAccountSlot.className).toContain("xl:w-40");

    mountedState.current = true;
    sessionState.current = null;
    rerender(<Navbar />);

    expect(screen.getByTestId("notification-slot").className).toContain(
      "size-11",
    );
    expect(screen.getByTestId("account-slot").className).toBe(
      stableAccountSlotClassName,
    );

    sessionState.current = {
      user: {
        email: "admin@test.com",
        nickname: "Administrator",
        role: "admin",
      },
    };
    rerender(<Navbar />);

    expect(screen.getByTestId("account-slot").className).toBe(
      stableAccountSlotClassName,
    );
  });

  it("keeps long user and administrator identities inside the fixed account control", () => {
    sessionState.current = {
      user: {
        email: "admin@test.com",
        nickname: "一个非常非常长但不应该挤压导航的管理员昵称",
        role: "admin",
      },
    };

    renderWithShell();

    const account = screen.getByRole("button", {
      name: "一个非常非常长但不应该挤压导航的管理员昵称",
    });
    expect(account.className).toContain("size-11");
    expect(account.querySelector(".max-w-32")?.className).toContain("truncate");
  });

  it("keeps search, notifications, account, and product menu mutually exclusive", () => {
    renderWithShell();

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(screen.getByRole("button", { name: "通知" }));
    fireEvent.click(screen.getByRole("button", { name: "产品菜单" }));

    expect(screen.getByRole("button", { name: "搜索" }).dataset.open).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "通知" }).dataset.open).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "产品菜单" }).dataset.open).toBe(
      "true",
    );
  });

  it("shows achievement notices on the visible account trigger", async () => {
    achievementNoticeCount.mockResolvedValue(3);

    renderWithShell();

    expect(
      (await screen.findByTestId("achievement-notice-badge")).textContent,
    ).toBe("3");
  });

  it("clears the badge after achievement notices are marked as seen", async () => {
    let finishMarking!: () => void;
    achievementNoticeCount.mockResolvedValue(3);
    markAchievementNoticesSeen.mockReturnValue(
      new Promise<void>((resolve) => {
        finishMarking = resolve;
      }),
    );

    renderWithShell(
      <>
        <Navbar />
        <AchievementNoticesSeen unseenCount={3} />
      </>,
    );

    await screen.findByTestId("achievement-notice-badge");
    await act(async () => finishMarking());
    await waitFor(() =>
      expect(screen.queryByTestId("achievement-notice-badge")).toBeNull(),
    );
  });
});
