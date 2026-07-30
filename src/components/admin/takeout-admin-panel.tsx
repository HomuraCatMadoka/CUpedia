"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CanteenCard, CanteenShell } from "@/components/canteen/canteen-shell";
import type { DeleteImpact } from "@/lib/canteen-types";
import type { Takeout } from "@/lib/takeout-actions";
import {
  createTakeout,
  deleteTakeout,
  getTakeoutDeleteImpact,
  updateTakeout,
} from "@/lib/takeout-admin-actions";
import { cn } from "@/lib/utils";

function formatDeleteImpact(impact: DeleteImpact) {
  if (impact.menuItemCount > 0) {
    return `??? ${impact.menuItemCount} ?????????`;
  }
  return "?????????????????????";
}

export function TakeoutAdminPanel({ takeouts }: { takeouts: Takeout[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Takeout | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [editTarget, setEditTarget] = useState<Takeout | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editAnnouncement, setEditAnnouncement] = useState("");

  const basePath = "/admin/takeouts";

  async function openDeleteDialog(takeout: Takeout) {
    setDeleteTarget(takeout);
    const impact = await getTakeoutDeleteImpact(takeout.id);
    setDeleteImpact(impact);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createTakeout({
          name,
          location: location || null,
          announcement: announcement || null,
        });
        setName("");
        setLocation("");
        setAnnouncement("");
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "????");
      }
    });
  }

  function openEditDialog(takeout: Takeout) {
    setEditTarget(takeout);
    setEditName(takeout.name);
    setEditLocation(takeout.location ?? "");
    setEditAnnouncement(takeout.announcement ?? "");
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    startTransition(async () => {
      try {
        await updateTakeout(editTarget.id, {
          name: editName,
          location: editLocation || null,
          announcement: editAnnouncement || null,
        });
        setEditTarget(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "????");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteTakeout(deleteTarget.id);
        setDeleteTarget(null);
        setDeleteImpact(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "????");
      }
    });
  }

  return (
    <CanteenShell
      eyebrow="??"
      title="????"
      subtitle="??????????????????????????"
    >
      <form
        onSubmit={handleCreate}
        className="canteen-fade-in mb-8 rounded-2xl border border-[var(--canteen-bamboo)]/25 bg-white/70 p-5 backdrop-blur-sm"
      >
        <p className="mb-4 text-sm font-medium text-[var(--canteen-ink)]">
          ?????
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <label
              className="text-xs font-medium text-[var(--canteen-muted)]"
              htmlFor="takeout-name"
            >
              ??
            </label>
            <Input
              id="takeout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="border-[var(--canteen-bamboo)]/30 bg-white/90"
            />
          </div>
          <div className="min-w-[12rem] flex-1 space-y-1">
            <label
              className="text-xs font-medium text-[var(--canteen-muted)]"
              htmlFor="takeout-location"
            >
              ??????
            </label>
            <Input
              id="takeout-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={500}
              className="border-[var(--canteen-bamboo)]/30 bg-white/90"
            />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <label
            className="text-xs font-medium text-[var(--canteen-muted)]"
            htmlFor="takeout-announcement"
          >
            ??????
          </label>
          <Textarea
            id="takeout-announcement"
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            maxLength={500}
            placeholder="????????? � ??????"
            className="min-h-16 border-[var(--canteen-bamboo)]/30 bg-white/90"
          />
        </div>
        <div className="mt-4">
          <Button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[var(--canteen-purple)] hover:bg-[var(--canteen-purple)]/90"
          >
            ?????
          </Button>
        </div>
      </form>

      {takeouts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--canteen-bamboo)]/40 bg-white/50 px-6 py-16 text-center">
          <p className="text-[var(--canteen-muted)]">????????????</p>
        </div>
      ) : (
        <div className="canteen-icon-grid sm:!grid-cols-2 md:!grid-cols-3">
          {takeouts.map((takeout, i) => (
            <div
              key={takeout.id}
              className={`canteen-fade-in ${i % 2 === 1 ? "canteen-fade-in-delay-1" : ""}`}
            >
              <CanteenCard canteen={takeout} href={`${basePath}/${takeout.id}`} />
              <div className="mt-2 flex flex-wrap justify-center gap-2 px-1">
                <Link
                  href={`${basePath}/${takeout.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "rounded-full",
                  )}
                >
                  ????
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={isPending}
                  onClick={() => openEditDialog(takeout)}
                >
                  ??
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full"
                  disabled={isPending}
                  onClick={() => openDeleteDialog(takeout)}
                >
                  ??
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteImpact(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ?????{deleteTarget?.name}??
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteImpact
                ? formatDeleteImpact(deleteImpact)
                : "????"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>??</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              ??
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <AlertDialogContent>
          <form onSubmit={handleEdit}>
            <AlertDialogHeader>
              <AlertDialogTitle>?????</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="grid gap-3 py-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="edit-takeout-name">
                  ??
                </label>
                <Input
                  id="edit-takeout-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="edit-takeout-location"
                >
                  ??
                </label>
                <Input
                  id="edit-takeout-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  maxLength={500}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="edit-takeout-announcement"
                >
                  ??
                </label>
                <Textarea
                  id="edit-takeout-announcement"
                  value={editAnnouncement}
                  onChange={(e) => setEditAnnouncement(e.target.value)}
                  maxLength={500}
                  placeholder="????????? � ??????"
                  className="min-h-16"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">??</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={isPending}>
                ??
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </CanteenShell>
  );
}
