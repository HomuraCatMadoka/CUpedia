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

const { push, refresh, signOut, toastError } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { email: "user@test.com", nickname: "TestUser" },
      },
    }),
    signOut,
  },
}));

vi.mock("@/hooks/use-mounted", () => ({
  useMounted: () => true,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

vi.mock("@/components/layout/command-search", () => ({
  CommandSearch: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
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
}));

import { Navbar } from "@/components/layout/navbar";

describe("Navbar sign-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue({ error: null });
  });

  it("navigates to login and refreshes after sign-out succeeds", async () => {
    let completeSignOut!: (result: { error: null }) => void;
    signOut.mockReturnValue(
      new Promise((resolve) => {
        completeSignOut = resolve;
      }),
    );
    render(<Navbar />);

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
    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: "登出" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("请求失败"));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers global links to personal course pages", () => {
    render(<Navbar />);

    fireEvent.click(screen.getByRole("button", { name: "我的测评" }));
    expect(push).toHaveBeenCalledWith("/courses/my-reviews");

    fireEvent.click(screen.getByRole("button", { name: "我的成就" }));
    expect(push).toHaveBeenCalledWith("/courses/achievements");
  });
});
