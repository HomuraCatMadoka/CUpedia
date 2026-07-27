"use client";

import { useCallback, useEffect, useRef } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { MessageSquareIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDiscussions } from "@/components/wiki/discussion-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { cn } from "@/lib/utils";

export function DiscussionPanelTrigger({
  hideWhenEmpty = false,
  compact = false,
}: {
  hideWhenEmpty?: boolean;
  compact?: boolean;
}) {
  const { discussions, panelOpen, setPanelOpen, panelTriggerRef } =
    useDiscussions();
  const unresolvedCount = discussions.filter((item) => !item.resolved).length;

  if (hideWhenEmpty && unresolvedCount === 0) return null;

  return (
    <Button
      ref={panelTriggerRef}
      type="button"
      size={compact ? "icon-sm" : "sm"}
      variant="ghost"
      aria-label={panelOpen ? "关闭批注" : "打开批注"}
      aria-controls="wiki-discussion-panel"
      aria-expanded={panelOpen}
      onClick={() => setPanelOpen(!panelOpen)}
    >
      <MessageSquareIcon aria-hidden="true" className="size-4" />
      {!compact && (
        <span className="hidden sm:inline">
          批注{unresolvedCount > 0 ? ` ${unresolvedCount}` : ""}
        </span>
      )}
    </Button>
  );
}

export function ResponsiveDiscussionPanel({
  children,
  onCancelDraft,
  variant = "reader",
}: {
  children: React.ReactNode;
  onCancelDraft?: () => void;
  variant?: "reader" | "editor";
}) {
  const {
    activeCommentId,
    panelOpen,
    setActiveCommentId,
    setPanelOpen,
    panelTriggerRef,
  } = useDiscussions();
  const mobile = useMediaQuery("(max-width: 767px)");
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const commentHistoryTokenRef = useRef<string | null>(null);
  const commentHistoryCleanupFrameRef = useRef<number | null>(null);
  const { bottomInset } = useVisualViewport();
  const compactComposer =
    mobile && variant === "editor" && activeCommentId === "draft";

  const closeDirectly = useCallback(() => {
    if (activeCommentId === "draft") {
      onCancelDraft?.();
      setActiveCommentId(null);
    }
    setPanelOpen(false);
    if (!compactComposer) {
      requestAnimationFrame(() => panelTriggerRef.current?.focus());
    }
  }, [
    activeCommentId,
    compactComposer,
    onCancelDraft,
    panelTriggerRef,
    setActiveCommentId,
    setPanelOpen,
  ]);

  const close = useCallback(() => {
    const token = commentHistoryTokenRef.current;
    const currentToken = (
      window.history.state as {
        cupediaMobileCommentComposerToken?: string;
      } | null
    )?.cupediaMobileCommentComposerToken;

    closeDirectly();
    if (token && currentToken === token) {
      commentHistoryTokenRef.current = null;
      window.history.back();
    }
  }, [closeDirectly]);

  useEffect(() => {
    if (!panelOpen || !compactComposer) return;

    if (commentHistoryCleanupFrameRef.current !== null) {
      cancelAnimationFrame(commentHistoryCleanupFrameRef.current);
      commentHistoryCleanupFrameRef.current = null;
    }
    const currentToken = (
      window.history.state as {
        cupediaMobileCommentComposerToken?: string;
      } | null
    )?.cupediaMobileCommentComposerToken;
    const token = currentToken ?? crypto.randomUUID();
    const composerUrl = window.location.href;
    if (!currentToken) {
      window.history.pushState(
        {
          ...window.history.state,
          cupediaMobileCommentComposerToken: token,
        },
        "",
        window.location.href,
      );
    }
    commentHistoryTokenRef.current = token;

    const handlePopState = (event: PopStateEvent) => {
      const nextToken = (
        event.state as {
          cupediaMobileCommentComposerToken?: string;
        } | null
      )?.cupediaMobileCommentComposerToken;
      if (nextToken === token || commentHistoryTokenRef.current !== token) {
        return;
      }
      commentHistoryTokenRef.current = null;
      closeDirectly();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      commentHistoryCleanupFrameRef.current = requestAnimationFrame(() => {
        commentHistoryCleanupFrameRef.current = null;
        const currentToken = (
          window.history.state as {
            cupediaMobileCommentComposerToken?: string;
          } | null
        )?.cupediaMobileCommentComposerToken;
        if (
          window.location.href === composerUrl &&
          commentHistoryTokenRef.current === token &&
          currentToken === token
        ) {
          commentHistoryTokenRef.current = null;
          window.history.back();
        }
      });
    };
  }, [closeDirectly, compactComposer, panelOpen]);

  useEffect(
    () => () => {
      if (commentHistoryCleanupFrameRef.current !== null) {
        cancelAnimationFrame(commentHistoryCleanupFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!panelOpen || mobile) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close, mobile, panelOpen]);

  if (mobile) {
    return (
      <Drawer.Root
        open={panelOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        swipeDirection="down"
      >
        <Drawer.Portal>
          <Drawer.Backdrop
            data-testid="mobile-comment-backdrop"
            className="fixed inset-0 z-40 bg-black/55 opacity-100 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"
          />
          <Drawer.Viewport
            style={{ bottom: `${bottomInset}px` }}
            className="pointer-events-none fixed inset-0 z-50 flex items-end overflow-hidden"
          >
            <Drawer.Popup
              id="wiki-discussion-panel"
              initialFocus={compactComposer ? undefined : mobileCloseRef}
              finalFocus={compactComposer ? false : panelTriggerRef}
              className={cn(
                "pointer-events-auto w-full translate-y-0 border-t bg-background shadow-2xl outline-none transition-transform duration-200 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full motion-reduce:transform-none motion-reduce:transition-none",
                compactComposer
                  ? "max-h-44 bg-[#f7f7f5] dark:bg-[#252525]"
                  : "max-h-[min(75dvh,42rem)] rounded-t-2xl",
              )}
            >
              <Drawer.Content
                className={cn(
                  "flex min-h-0 flex-col pb-[env(safe-area-inset-bottom)]",
                  compactComposer ? "max-h-44" : "max-h-[min(75dvh,42rem)]",
                )}
              >
                {compactComposer ? (
                  <>
                    <Drawer.Title className="sr-only">添加批注</Drawer.Title>
                    <div className="min-h-0 flex-1 px-3 py-3">{children}</div>
                  </>
                ) : (
                  <>
                    <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
                    <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
                      <Drawer.Title className="text-sm font-semibold">
                        批注
                      </Drawer.Title>
                      <Drawer.Close
                        ref={mobileCloseRef}
                        aria-label="关闭批注"
                        className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <XIcon aria-hidden="true" className="size-4" />
                      </Drawer.Close>
                    </div>
                    <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4">
                      {children}
                    </div>
                  </>
                )}
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  if (!panelOpen) return null;

  return (
    <aside
      id="wiki-discussion-panel"
      aria-label="批注"
      className={cn(
        "fixed right-4 top-[calc(var(--navbar-height)+1rem)] z-40 max-h-[calc(100dvh-var(--navbar-height)-2rem)] w-72 overflow-y-auto rounded-lg border bg-background p-3 shadow-lg min-[1360px]:sticky min-[1360px]:top-4 min-[1360px]:z-auto min-[1360px]:shrink-0 min-[1360px]:shadow-none",
        variant === "editor" &&
          "min-[1360px]:top-0 min-[1360px]:right-0 min-[1360px]:h-full min-[1360px]:max-h-none min-[1360px]:w-80 min-[1360px]:rounded-none min-[1360px]:border-y-0 min-[1360px]:border-r-0",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">批注</h2>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="关闭批注"
          onClick={close}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </Button>
      </div>
      {children}
    </aside>
  );
}
