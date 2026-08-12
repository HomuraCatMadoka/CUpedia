"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AnnouncementAdminEditor } from "@/components/admin/announcement-admin-editor";
import { AnnouncementAdminList } from "@/components/admin/announcement-admin-list";
import { useAnnouncementAdminOperations } from "@/components/admin/announcement-admin-operations";
import { announcementLifecycleOf } from "@/components/admin/announcement-admin-presentation";
import {
  EMPTY_ANNOUNCEMENT_FORM,
  announcementToFormState,
  useAnnouncementAdminEditor,
} from "@/components/admin/use-announcement-admin-editor";
import { useUnsavedAnnouncementNavigation } from "@/components/admin/use-unsaved-announcement-navigation";
import { Button } from "@/components/ui/button";
import type { AdminAnnouncement } from "@/lib/announcement-types";

export function AnnouncementAdminPanel({
  announcements,
  serverNow,
  initialAnnouncementId = null,
}: {
  announcements: AdminAnnouncement[];
  serverNow: string;
  initialAnnouncementId?: string | null;
}) {
  const router = useRouter();
  const initialAnnouncement =
    announcements.find((item) => item.id === initialAnnouncementId) ?? null;
  const initialForm = initialAnnouncement
    ? announcementToFormState(initialAnnouncement, new Date(serverNow))
    : EMPTY_ANNOUNCEMENT_FORM;
  const [lifecycleNowMs, setLifecycleNowMs] = useState(() =>
    new Date(serverNow).getTime(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialAnnouncement?.id ?? null,
  );
  const editor = useAnnouncementAdminEditor({
    initialForm,
    initiallyOpen: initialAnnouncement !== null,
  });
  const lifecycleNow = new Date(lifecycleNowMs);
  const selected = announcements.find((item) => item.id === selectedId) ?? null;
  const selectedLifecycle = selected
    ? announcementLifecycleOf(selected, lifecycleNow)
    : "draft";
  const operations = useAnnouncementAdminOperations({
    selected,
    lifecycle: selectedLifecycle,
    lifecycleNow,
    editor,
    onRefresh: () => router.refresh(),
    onDeletedSelection: () => setSelectedId(null),
  });
  const { confirmDiscardChanges } = useUnsavedAnnouncementNavigation({
    isDirty: editor.isDirty,
  });
  const editorOpen = editor.mobileEditing || selected !== null;

  useEffect(() => {
    const serverEpoch = new Date(serverNow).getTime();
    const monotonicStart = performance.now();
    const timer = window.setInterval(() => {
      setLifecycleNowMs(serverEpoch + performance.now() - monotonicStart);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [serverNow]);

  function chooseAnnouncement(announcement: AdminAnnouncement) {
    if (!confirmDiscardChanges()) return;
    const nextForm = announcementToFormState(announcement, lifecycleNow);
    setSelectedId(announcement.id);
    editor.open(nextForm);
    const url = new URL(window.location.href);
    url.searchParams.set("announcement", announcement.id);
    window.history.replaceState(window.history.state, "", url);
  }

  function startNewAnnouncement() {
    if (!confirmDiscardChanges()) return;
    setSelectedId(null);
    editor.open(EMPTY_ANNOUNCEMENT_FORM);
    const url = new URL(window.location.href);
    url.searchParams.delete("announcement");
    window.history.replaceState(window.history.state, "", url);
  }

  function returnToList() {
    if (!confirmDiscardChanges()) return;
    editor.close();
    const url = new URL(window.location.href);
    url.searchParams.delete("announcement");
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">公告管理</h1>
        <Button type="button" variant="outline" onClick={startNewAnnouncement}>
          新建公告
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
        <AnnouncementAdminList
          announcements={announcements}
          now={lifecycleNow}
          selectedId={selectedId}
          hiddenOnMobile={editor.mobileEditing}
          onSelect={chooseAnnouncement}
        />

        <AnnouncementAdminEditor
          selected={selected}
          lifecycle={selectedLifecycle}
          isAlreadyPublic={operations.isAlreadyPublic}
          isPending={operations.isPending}
          editor={editor}
          onSubmit={operations.handleSubmit}
          onReturnToList={returnToList}
          onOpenSettings={operations.openSettings}
          onDelete={operations.requestDelete}
          onWithdraw={operations.requestWithdraw}
        />

        {!editorOpen && (
          <section className="hidden min-h-80 items-center justify-center rounded-xl border border-dashed text-center lg:flex">
            <div>
              <p className="font-medium">选择一条公告查看详情</p>
              <p className="mt-1 text-sm text-muted-foreground">
                或新建一条公告
              </p>
            </div>
          </section>
        )}
      </div>

      {operations.dialogs}
    </div>
  );
}
