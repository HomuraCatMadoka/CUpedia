"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setAchievementCatalogStatus } from "@/lib/achievement-catalog-actions";

export function AchievementCatalogStatusButton({
  catalogId,
  nextStatus,
}: {
  catalogId: string;
  nextStatus: "active" | "disabled" | "superseded";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const label =
    nextStatus === "active"
      ? "启用"
      : nextStatus === "disabled"
        ? "停用"
        : "标记为已替换";

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setError("");
              await setAchievementCatalogStatus(catalogId, nextStatus);
              router.refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "操作失败");
            }
          })
        }
        size="sm"
        type="button"
        variant="outline"
      >
        {pending ? "处理中…" : label}
      </Button>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
