"use client";

import { CheckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AchievementAvatar } from "@/components/user/achievement-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  equipHiddenAchievement,
  type HiddenAchievementGroup,
} from "@/lib/hidden-achievement-actions";
import { cn } from "@/lib/utils";

export function HiddenAchievementInventory({
  groups,
  avatarUrl,
}: {
  groups: HiddenAchievementGroup[];
  avatarUrl: string;
}) {
  const [selected, setSelected] = useState<HiddenAchievementGroup | null>(null);
  const [recipeId, setRecipeId] = useState("");
  const [pending, startTransition] = useTransition();

  if (groups.length === 0) return null;
  const selectedOption = selected?.options.find(
    (option) => option.recipeId === recipeId,
  );

  function equip() {
    if (!selected || !recipeId) return;
    startTransition(async () => {
      try {
        await equipHiddenAchievement(selected.sourceRuleKey, recipeId);
        setSelected(null);
        toast.success("已佩戴称号");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "佩戴失败");
      }
    });
  }

  return (
    <section aria-labelledby="hidden-achievements" className="mt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold" id="hidden-achievements">
          隐藏成就
        </h2>
        <span className="text-xs text-muted-foreground">
          {groups.length} 项
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-4 py-3 text-sm font-medium">成就列表</div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 md:grid-cols-6">
          {groups.map((group) => (
            <button
              className="relative flex min-h-28 flex-col items-center justify-center bg-card px-3 py-5 text-center transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={group.sourceRuleKey}
              onClick={() => {
                setRecipeId(
                  group.selectedRecipeId ?? group.options[0]?.recipeId ?? "",
                );
                setSelected(group);
              }}
              type="button"
            >
              {group.claimable && (
                <span
                  aria-label="可领取"
                  className="absolute right-3 top-3 size-2 rounded-full bg-orange-500 ring-2 ring-card"
                />
              )}
              <span className="text-base font-semibold tracking-[0.08em] text-[#9a6815]">
                {group.badgeCode}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">传说</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>已解锁 {groups.length}</span>
          <span>1 / 1</span>
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !pending) setSelected(null);
        }}
        open={Boolean(selected)}
      >
        <DialogContent className="gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{selected?.displayName}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-8 px-5 py-6 sm:grid-cols-[1fr_220px]">
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  前置成就
                </p>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <span className="font-semibold tracking-[0.08em] text-[#9a6815]">
                    {selected?.badgeCode}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-[#80601e]">
                    <CheckIcon className="size-3.5" /> 已满足
                  </span>
                </div>
              </div>

              <fieldset>
                <legend className="mb-2 text-xs font-medium text-muted-foreground">
                  佩戴称号
                </legend>
                <div className="space-y-2">
                  {selected?.options.map((option) => (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        recipeId === option.recipeId &&
                          "border-[#c5973f] bg-[#fffaf0]",
                      )}
                      key={option.recipeId}
                    >
                      <input
                        checked={recipeId === option.recipeId}
                        className="accent-[#a97920]"
                        name="person-title"
                        onChange={() => setRecipeId(option.recipeId)}
                        type="radio"
                        value={option.recipeId}
                      />
                      <span className="font-medium">{option.displayName}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                预览
              </p>
              <div className="flex min-h-56 items-center justify-center rounded-xl bg-muted/35 p-4">
                <AchievementAvatar
                  image={avatarUrl}
                  size="preview"
                  title={
                    selectedOption
                      ? {
                          badgeCode: selected?.badgeCode ?? "",
                          displayName: selectedOption.displayName,
                        }
                      : null
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter className="m-0 rounded-none rounded-b-xl px-5 py-4">
            <DialogClose
              render={<Button disabled={pending} variant="outline" />}
            >
              取消
            </DialogClose>
            <Button disabled={!recipeId || pending} onClick={equip}>
              {pending ? "佩戴中..." : "确认佩戴"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
