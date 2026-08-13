"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { announcementLifecycleOf } from "@/components/admin/announcement-admin-presentation";
import type { AdminAnnouncement } from "@/lib/announcement-types";

export type PublicationMode = "draft" | "immediate" | "scheduled";
export type AnnouncementFormState = {
  title: string;
  content: string;
  priority: string;
  publishAt: string;
  expiresAt: string;
  publicationMode: PublicationMode;
  sendNotification: boolean;
};
export type AnnouncementFormField =
  | "title"
  | "content"
  | "priority"
  | "publishAt"
  | "expiresAt";
export type AnnouncementFormError = {
  message: string;
  field: AnnouncementFormField | null;
};

export const EMPTY_ANNOUNCEMENT_FORM: AnnouncementFormState = {
  title: "",
  content: "",
  priority: "0",
  publishAt: "",
  expiresAt: "",
  publicationMode: "draft",
  sendNotification: false,
};

export const ANNOUNCEMENT_FIELD_IDS: Record<AnnouncementFormField, string> = {
  title: "announcement-title",
  content: "announcement-content",
  priority: "announcement-priority",
  publishAt: "announcement-publish-at",
  expiresAt: "announcement-expiry",
};

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function announcementToFormState(
  announcement: AdminAnnouncement,
  now: Date,
): AnnouncementFormState {
  const lifecycle = announcementLifecycleOf(announcement, now);
  return {
    title: announcement.title,
    content: announcement.content,
    priority: String(announcement.priority),
    publishAt:
      lifecycle === "withdrawn"
        ? ""
        : toLocalDateTimeInput(announcement.publishedAt),
    expiresAt:
      lifecycle === "withdrawn"
        ? ""
        : toLocalDateTimeInput(announcement.expiresAt),
    publicationMode:
      lifecycle === "scheduled"
        ? "scheduled"
        : lifecycle === "draft" || lifecycle === "withdrawn"
          ? "draft"
          : "immediate",
    sendNotification:
      lifecycle !== "withdrawn" &&
      announcement.notifyOnPublish &&
      !announcement.notificationSentAt,
  };
}

function fieldForError(message: string): AnnouncementFormField | null {
  if (message.includes("标题")) return "title";
  if (message.includes("内容")) return "content";
  if (message.includes("优先级")) return "priority";
  if (message.includes("失效时间")) return "expiresAt";
  if (message.includes("发布时间")) return "publishAt";
  return null;
}

export function useAnnouncementAdminEditor({
  initialForm,
  initiallyOpen,
}: {
  initialForm: AnnouncementFormState;
  initiallyOpen: boolean;
}) {
  const [form, setForm] = useState(initialForm);
  const [baseline, setBaseline] = useState(initialForm);
  const [error, setError] = useState<AnnouncementFormError | null>(null);
  const [mobileEditing, setMobileEditing] = useState(initiallyOpen);
  const generalErrorRef = useRef<HTMLParagraphElement>(null);
  const isDirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const open = useCallback((nextForm: AnnouncementFormState) => {
    setForm(nextForm);
    setBaseline(nextForm);
    setError(null);
    setMobileEditing(true);
  }, []);
  const markSaved = useCallback((savedForm: AnnouncementFormState) => {
    setForm(savedForm);
    setBaseline(savedForm);
    setError(null);
  }, []);
  const reportError = useCallback((caught: unknown, fallback: string) => {
    const message = caught instanceof Error ? caught.message : fallback;
    const field = fieldForError(message);
    setError({ message, field });
    toast.error(message);
    window.requestAnimationFrame(() => {
      const target = field
        ? document.getElementById(ANNOUNCEMENT_FIELD_IDS[field])
        : generalErrorRef.current;
      target?.focus();
    });
  }, []);
  const clearFieldError = useCallback((field: AnnouncementFormField) => {
    setError((current) => (current?.field === field ? null : current));
  }, []);

  return {
    form,
    setForm,
    error,
    setError,
    generalErrorRef,
    isDirty,
    mobileEditing,
    open,
    markSaved,
    reportError,
    clearFieldError,
    close: () => setMobileEditing(false),
  };
}

export type AnnouncementAdminEditorController = ReturnType<
  typeof useAnnouncementAdminEditor
>;
