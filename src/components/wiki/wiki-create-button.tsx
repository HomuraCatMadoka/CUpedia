"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
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
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const isPending = pendingPath !== null && pendingPath !== pathname;
  const fallbackQuery = new URLSearchParams({ draft: "1" });
  if (parentId) fallbackQuery.set("parent", parentId);
  const fallbackHref = `/wiki/new?${fallbackQuery}`;

  useEffect(() => {
    preloadWikiEditor();
  }, []);

  const create = async () => {
    if (pendingRef.current && pendingPath !== pathname) return;
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
    onCreated?.();

    const query = new URLSearchParams({ draft: "1" });
    if (parentId) query.set("parent", parentId);
    const destination = `/wiki/${id}?${query}`;
    setPendingPath(`/wiki/${id}`);
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

    if (await persistDraft) {
      wikiTree?.confirm(mutationToken);
    } else {
      wikiTree?.rollback(mutationToken);
      pendingRef.current = false;
      setPendingPath(null);
    }
  };

  return (
    <a
      href={fallbackHref}
      role="button"
      aria-disabled={disabled || isPending}
      aria-busy={isPending}
      className={cn(
        buttonVariants({ variant, size, className }),
        (disabled || isPending) && "pointer-events-none opacity-50",
      )}
      onClick={(event) => {
        event.preventDefault();
        if (disabled || isPending) return;
        void create();
      }}
      {...props}
    >
      {children}
    </a>
  );
}
