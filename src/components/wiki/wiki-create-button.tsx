"use client";

import { useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import { Button } from "@/components/ui/button";
import { createWikiPage } from "@/lib/wiki-actions";
import { useOptionalWikiTree } from "@/components/wiki/wiki-tree-provider";

type WikiCreateButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  parentId?: string | null;
  onCreated?: () => void;
};

export function WikiCreateButton({
  parentId,
  onCreated,
  disabled,
  children,
  ...props
}: WikiCreateButtonProps) {
  const router = useRouter();
  const wikiTree = useOptionalWikiTree();
  const { ensureContributorSetup } = useContributorSetup();
  const retryId = useRef<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const create = async () => {
    if (isPending || !(await ensureContributorSetup())) return;

    const id = retryId.current ?? crypto.randomUUID();
    retryId.current = id;
    setIsPending(true);
    const mutationToken =
      wikiTree?.projectUpsert({
        id,
        title: "",
        icon: null,
        parentId: parentId ?? null,
      }) ?? null;
    try {
      const page = await createWikiPage({ id, parentId });
      wikiTree?.confirm(mutationToken, {
        id: page.id,
        title: page.title,
        icon: page.icon,
        parentId: page.parentId,
        sortOrder: page.sortOrder,
      });
      retryId.current = null;
      onCreated?.();
      const destination = `/wiki/${id}`;
      window.dispatchEvent(
        new CustomEvent("cupedia:editor-navigation-bypass", {
          detail: destination,
        }),
      );
      router.push(destination);
    } catch {
      wikiTree?.rollback(mutationToken);
      toast.error("创建页面失败，请重试");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      type="button"
      disabled={disabled || isPending}
      aria-busy={isPending}
      onClick={create}
      {...props}
    >
      {children}
    </Button>
  );
}
