"use client";

import { useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import { Button } from "@/components/ui/button";
import { createWikiPage } from "@/lib/wiki-actions";

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
  const { ensureContributorSetup } = useContributorSetup();
  const retryId = useRef<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const create = async () => {
    if (isPending || !(await ensureContributorSetup())) return;

    const id = retryId.current ?? crypto.randomUUID();
    retryId.current = id;
    setIsPending(true);
    try {
      await createWikiPage({ id, parentId });
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
