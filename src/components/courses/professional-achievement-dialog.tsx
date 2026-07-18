"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { AchievementRevokeButton } from "@/components/courses/achievement-revoke-button";
import {
  ProfessionalBadgeLogo,
  type ProfessionalBadgeTier,
} from "@/components/courses/professional-badge-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { redeemProfessionalAchievement } from "@/lib/achievement-actions";
import type { ProfessionalAchievementInventoryProgramme } from "@/lib/achievement-inventory";
import { setPrimaryAchievement } from "@/lib/achievement-profile-actions";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<ProfessionalBadgeTier, string> = {
  bronze: "铜级",
  silver: "银级",
  gold: "金级",
};

const CURRENT_TIER_STYLE: Record<ProfessionalBadgeTier, string> = {
  bronze: "border-[#dfb8aa] bg-[#fff6f2]",
  silver: "border-[#bcc9d0] bg-[#f2f6f8]",
  gold: "border-[#dfc46d] bg-[#fff8e2]",
};

function allocationMessage(item: ProfessionalAchievementInventoryProgramme) {
  if (!item.next) return "";
  const verb = item.next.action === "upgrade" ? "升级" : "解锁";
  return `本次用于${verb} ${item.badgeCode} 成就的 ${item.next.requiredCount} 门课，不能再用于解锁其他专业成就。`;
}

function subjectGroupLabel(subjectCodes: string[]) {
  return `${subjectCodes.join(" / ")} 课程`;
}

export function ProfessionalAchievementDialog({
  item,
  open,
  onOpenChange,
  primaryAchievementId,
}: {
  item: ProfessionalAchievementInventoryProgramme | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryAchievementId: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!item) return null;

  const target = item.next;
  const actionable = Boolean(target?.eligible);
  const primary = item.current?.achievementId === primaryAchievementId;
  const badgeCode = item.badgeCode;
  const currentAchievementId = item.current?.achievementId ?? null;
  const usedForFusion =
    !item.current &&
    !target &&
    item.tiers.some((tier) => tier.status === "completed");
  const heading = target
    ? item.current
      ? "升级条件"
      : "领取条件"
    : item.current
      ? "当前等级"
      : "成就状态";

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirming(false);
      setError("");
    }
    onOpenChange(nextOpen);
  }

  function redeem() {
    if (!target?.eligible) return;
    setError("");
    startTransition(async () => {
      try {
        await redeemProfessionalAchievement(target.ruleId);
        setConfirming(false);
        toast.success(
          `${badgeCode} 成就已${target.action === "upgrade" ? "升级" : "领取"}`,
        );
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作失败");
      }
    });
  }

  function changePrimary() {
    if (!currentAchievementId) return;
    setError("");
    startTransition(async () => {
      try {
        await setPrimaryAchievement(currentAchievementId);
        toast.success("已设为评论旁展示");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作失败");
      }
    });
  }

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[min(640px,calc(100vw-2rem))] max-w-2xl gap-0 overflow-y-auto overscroll-contain p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        {confirming && target ? (
          <>
            <DialogHeader className="border-b px-6 py-5 pr-16">
              <DialogTitle className="text-xl font-bold">
                确认{target.action === "upgrade" ? "升级" : "领取"}{" "}
                {item.badgeCode}？
              </DialogTitle>
              <DialogDescription className="sr-only">
                确认本次专业成就课程分配
              </DialogDescription>
            </DialogHeader>
            <DialogClose
              render={
                <Button
                  aria-label="关闭"
                  className="absolute top-4 right-4"
                  disabled={pending}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <XIcon />
            </DialogClose>
            <div className="px-6 py-6">
              <p className="rounded-xl bg-muted/60 px-4 py-4 text-sm leading-6 text-muted-foreground">
                {allocationMessage(item)}
              </p>
              {error && (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter className="m-0 rounded-none px-6 py-4">
              <Button
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                  setError("");
                }}
                type="button"
                variant="outline"
              >
                返回
              </Button>
              <Button disabled={pending} onClick={redeem} type="button">
                {pending
                  ? target.action === "upgrade"
                    ? "升级中…"
                    : "领取中…"
                  : target.action === "upgrade"
                    ? "确认升级"
                    : "确认领取"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="px-6 pt-6 pr-16 pb-4">
              <DialogTitle className="text-2xl font-bold">
                {item.displayName}
              </DialogTitle>
              <DialogDescription className="sr-only">
                查看 {item.badgeCode} 专业成就的等级和课程进度
              </DialogDescription>
            </DialogHeader>
            <DialogClose
              render={
                <Button
                  aria-label="关闭"
                  className="absolute top-4 right-4"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <XIcon />
            </DialogClose>

            <div className="px-6 pb-6">
              <div
                aria-label={`${item.badgeCode} 成就等级`}
                className="grid gap-2 rounded-xl border bg-muted/20 p-4"
                role="list"
                style={{
                  gridTemplateColumns: `repeat(${item.tiers.length}, minmax(0, 1fr))`,
                }}
              >
                {item.tiers.map((tier) => {
                  const current = tier.status === "current";
                  const statusLabel =
                    tier.status === "completed"
                      ? "已完成"
                      : current
                        ? "当前"
                        : "未解锁";
                  return (
                    <div
                      aria-label={`${item.badgeCode} ${TIER_LABEL[tier.tier]}，${statusLabel}`}
                      className={cn(
                        "grid min-h-24 grid-rows-[16px_1fr_16px] items-center rounded-lg border border-transparent px-1 py-2 text-center transition-colors",
                        current && CURRENT_TIER_STYLE[tier.tier],
                      )}
                      key={tier.ruleId}
                      role="listitem"
                    >
                      <span className="text-[10px] text-muted-foreground">
                        {statusLabel}
                      </span>
                      <ProfessionalBadgeLogo
                        className="-my-4 justify-self-center"
                        code={item.badgeCode}
                        size={64}
                        tier={tier.tier}
                      />
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {TIER_LABEL[tier.tier]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <section
                aria-labelledby="achievement-condition-title"
                className="mt-6"
              >
                <h3
                  className="text-lg font-semibold"
                  id="achievement-condition-title"
                >
                  {heading}
                </h3>
                <div className="mt-3">
                  {target ? (
                    target.subjectGroups.map((group, groupIndex) => (
                      <div
                        aria-label={`${subjectGroupLabel(group.subjectCodes)}，${group.matchedCount}/${group.requiredCount}`}
                        className="flex min-h-14 items-center justify-between gap-4 border-b py-3 last:border-b-0"
                        key={`${group.subjectCodes.join("-")}-${group.requiredCount}-${groupIndex}`}
                        role="group"
                      >
                        <span className="min-w-0 text-sm">
                          {subjectGroupLabel(group.subjectCodes)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="flex shrink-0 gap-1.5"
                        >
                          {Array.from(
                            { length: group.requiredCount },
                            (_, index) => (
                              <span
                                className={cn(
                                  "h-1.5 w-6 rounded-full border border-border",
                                  index < group.matchedCount &&
                                    "border-foreground bg-foreground",
                                )}
                                key={index}
                              />
                            ),
                          )}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="py-5 text-sm text-muted-foreground">
                      {item.current
                        ? "已经获得这个专业成就的最高等级。"
                        : usedForFusion
                          ? "这个专业成就已用于合成人物成就。"
                          : "这个专业成就暂时不能领取。"}
                    </p>
                  )}
                </div>

                {target?.eligible && (
                  <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    {allocationMessage(item)}
                  </p>
                )}
                {target && !target.prerequisiteSatisfied && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    需要先获得前一级成就。
                  </p>
                )}
                {target && !target.slotAvailable && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    这个等级目前只能保留一个成就。
                  </p>
                )}
                {error && (
                  <p className="mt-3 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
              </section>
            </div>

            <DialogFooter className="m-0 flex-row flex-wrap items-center justify-between rounded-none px-6 py-4 sm:justify-between">
              <div className="min-h-5 shrink-0 text-xs">
                {item.current && (
                  <AchievementRevokeButton
                    achievementId={item.current.achievementId}
                    displayName={item.displayName}
                  />
                )}
              </div>
              {actionable || (item.current && !primary) ? (
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  {item.current && !primary && (
                    <Button
                      disabled={pending}
                      onClick={changePrimary}
                      type="button"
                      variant="outline"
                    >
                      {pending ? "保存中…" : "设为评论旁展示"}
                    </Button>
                  )}
                  {actionable && target && (
                    <Button
                      disabled={pending}
                      onClick={() => setConfirming(true)}
                      type="button"
                    >
                      {target.action === "upgrade" ? "升级" : "领取"}{" "}
                      {item.badgeCode}
                    </Button>
                  )}
                </div>
              ) : !item.current ? (
                <Button disabled type="button">
                  {target ? "还未满足条件" : "暂时不能领取"}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
