"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { useOptionalWikiTree } from "@/components/wiki/wiki-tree-provider";
import { preloadWikiEditor } from "@/components/wiki/wiki-editor-lazy";
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
  const router = useRouter();
  const pathname = usePathname();
  const wikiTree = useOptionalWikiTree();
  const { ensureContributorSetup } = useContributorSetup();
  const pendingRef = useRef(false);
  const pendingPathRef = useRef<string | null>(null);
  const fallbackQuery = new URLSearchParams({ draft: "1" });
  if (parentId) fallbackQuery.set("parent", parentId);
  const fallbackHref = `/wiki/new?${fallbackQuery}`;

  useEffect(() => {
    preloadWikiEditor();
  }, []);

  useEffect(() => {
    if (pendingPathRef.current !== pathname) return;
    pendingRef.current = false;
    pendingPathRef.current = null;
  }, [pathname]);

  const create = () => {
    if (pendingRef.current) return;
    pendingRef.current = true;

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
    pendingPathRef.current = `/wiki/${id}`;
    const persistDraft = contributorReady
      .then(async (ready) => {
        if (!ready) return false;
        const response = await fetch("/api/wiki-drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, parentId: parentId ?? null }),
          keepalive: true,
        });
        return response.ok;
      })
      .catch(() => false);
    window.dispatchEvent(
      new CustomEvent("cupedia:editor-navigation-bypass", {
        detail: destination,
      }),
    );
    router.push(destination);
    void persistDraft;
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
        create();
      }}
      {...props}
    >
      {children}
    </a>
  );
}
