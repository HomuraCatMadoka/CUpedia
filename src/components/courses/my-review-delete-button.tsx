"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteCourseReviewSubmission,
  getCourseReviewDeletionImpact,
} from "@/lib/course-review-actions";
import type { PublicDeletionImpact } from "@/lib/achievement-recompute-db";

export function MyReviewDeleteButton({
  courseCode,
  ratingId,
}: {
  courseCode: string;
  ratingId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [impact, setImpact] = useState<PublicDeletionImpact | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError("");
    startTransition(async () => {
      try {
        await deleteCourseReviewSubmission(
          courseCode,
          {
            id: ratingId,
            type: "rating",
          },
          impact?.kind,
        );
        setOpen(false);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "删除失败");
      }
    });
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setError("");
    setImpact(null);
    startTransition(async () => {
      try {
        setImpact(
          await getCourseReviewDeletionImpact(courseCode, {
            id: ratingId,
            type: "rating",
          }),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "无法检查删除影响");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
        <Trash2Icon aria-hidden="true" />
        删除
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除 {courseCode} 的测评？</AlertDialogTitle>
          <AlertDialogDescription>
            这会删除你的评分和评论；此操作不能撤销。
            {impact?.kind === "downgraded" &&
              ` 删除后，有关专业称号将降为${impact.nextTier === "silver" ? "银标" : "铜标"}。`}
            {impact?.kind === "revoked" &&
              " 删除后，有关专业称号将不再满足条件并被撤销。"}
            {impact?.kind === "dismantled" &&
              " 删除后，人名称号将无法维持并自动拆解，仍有效的来源称号会恢复。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction
            className="text-destructive"
            disabled={pending || !impact}
            onClick={remove}
            variant="outline"
          >
            {pending ? (impact ? "删除中…" : "检查中…") : "确认删除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
