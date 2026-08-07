"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOptionalWikiTree } from "@/components/wiki/wiki-tree-provider";
import { preloadWikiEditor } from "@/components/wiki/wiki-editor-lazy";
import { navigateDocument } from "@/lib/document-navigation";
import { cn } from "@/lib/utils";

type WikiCreateButtonProps = Omit<ComponentProps<"a">, "href" | "onClick"> &
  Pick<ComponentProps<typeof Button>, "variant" | "size"> & {
    parentId?: string | null;
    onCreated?: () => void;
    disabled?: boolean;
  };

export function WikiCreateButton({
  parentId,
  onCreated,
  disabled,
  children,
  variant = "default",
  size = "default",
  className,
  ...props
}: WikiCreateButtonProps) {
  const pathname = usePathname();
  const wikiTree = useOptionalWikiTree();
  const { ensureContributorSetup } = useContributorSetup();
  const pendingRef = useRef(false);
  const pathnameRef = useRef(pathname);
  const mountedRef = useRef(true);
  const fallbackQuery = new URLSearchParams({ draft: "1" });
  if (parentId) fallbackQuery.set("parent", parentId);
  const fallbackHref = `/wiki/new?${fallbackQuery}`;

  useEffect(() => {
    mountedRef.current = true;
    preloadWikiEditor();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const create = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const sourcePathname = pathnameRef.current;

    const contributorReady = ensureContributorSetup();
    const id = crypto.randomUUID();
    const mutationToken =
      wikiTree?.projectUpsert({
        id,
        title: "",
        icon: null,
        parentId: parentId ?? null,
      }) ?? null;
    wikiTree?.confirm(mutationToken);
    onCreated?.();

    const query = new URLSearchParams({ draft: "1" });
    if (parentId) query.set("parent", parentId);
    const destination = `/wiki/${id}?${query}`;
    const cancel = () => {
      wikiTree?.rollback(mutationToken);
      pendingRef.current = false;
    };

    try {
      const ready = await contributorReady;
      if (
        !ready ||
        !mountedRef.current ||
        pathnameRef.current !== sourcePathname
      ) {
        cancel();
        return;
      }

      const response = await fetch("/api/wiki-drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, parentId: parentId ?? null }),
      });
      if (!response.ok) throw new Error("Unable to create private page");
      if (!mountedRef.current || pathnameRef.current !== sourcePathname) {
        cancel();
        return;
      }

      wikiTree?.confirm(mutationToken);
      window.dispatchEvent(
        new CustomEvent("cupedia:editor-navigation-bypass", {
          detail: destination,
        }),
      );
      navigateDocument(destination);
    } catch {
      cancel();
      toast.error("创建页面失败，请重试。");
    }
  };

  return (
    <a
      href={fallbackHref}
      role="button"
      aria-disabled={disabled || undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        disabled && "pointer-events-none opacity-50",
      )}
      onClick={(event) => {
        event.preventDefault();
        if (disabled || pendingRef.current) return;
        void create();
      }}
      onKeyDown={(event) => {
        if (event.key !== " ") return;
        event.preventDefault();
        if (disabled || pendingRef.current) return;
        void create();
      }}
      {...props}
    >
      {children}
    </a>
  );
}
