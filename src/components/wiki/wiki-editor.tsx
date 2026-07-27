"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type FocusEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, EllipsisIcon, ShareIcon } from "lucide-react";
import { Plate, usePlateEditor } from "platejs/react";
import { toast } from "sonner";

import { useAutosave, type AutosaveSaveReason } from "@/hooks/use-autosave";

import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { BlockSelectionKit } from "@/components/editor/plugins/block-selection-kit";
import { CalloutKit } from "@/components/editor/plugins/callout-kit";
import { CommentKit } from "@/components/editor/plugins/comment-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";
import { DndKit } from "@/components/editor/plugins/dnd-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { MathKit } from "@/components/editor/plugins/math-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { MediaKit } from "@/components/editor/plugins/media-kit";
import { TableKit } from "@/components/editor/plugins/table-kit";
import { TocKit } from "@/components/editor/plugins/toc-kit";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { WikiLinkKit } from "@/components/editor/plugins/wiki-link-kit";
import {
  WikiLinkPagesProvider,
  type WikiLinkPage,
} from "@/components/ui/wiki-link-node";
import { FloatingToolbarKit } from "@/components/editor/plugins/floating-toolbar-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { EditorContainer, Editor } from "@/components/ui/editor";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { DiscussionProvider } from "@/components/wiki/discussion-context";
import { DiscussionSidebar } from "@/components/wiki/discussion-sidebar";
import {
  clearDraftCommentMarks,
  serializeContentWithoutDraftComments,
} from "@/components/wiki/discussion-draft";
import { WikiIconPicker } from "@/components/wiki/wiki-icon-picker";
import { MobileWikiEditorToolbar } from "@/components/wiki/mobile-wiki-editor-toolbar";
import { SidebarMobileToggle } from "@/components/layout/sidebar-mobile-toggle";
import {
  DiscussionPanelTrigger,
  ResponsiveDiscussionPanel,
} from "@/components/wiki/responsive-discussion-panel";
import {
  EditConflictDialog,
  type EditConflict,
} from "@/components/wiki/edit-conflict-dialog";
import type { Discussion } from "@/lib/discussion-actions";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import {
  extractText,
  normalizeInitialValue,
  parseContent,
  type PlateValue,
} from "@/lib/plate-utils";

interface WikiSubmitResult {
  error?: string;
  slug?: string;
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  content?: string;
  version?: number;
  updatedAt?: string;
  conflict?: boolean;
  theirContent?: string;
  theirTitle?: string;
  theirIcon?: string | null;
  theirSlug?: string;
  theirParentId?: string | null;
  theirVersion?: number;
  theirUpdatedAt?: string;
}

interface WikiEditorProps {
  mode: "create" | "edit";
  pageId?: string;
  initialTitle?: string;
  initialIcon?: string | null;
  initialValue?: PlateValue;
  initialSlug?: string;
  expectedVersion?: number;
  expectedUpdatedAt?: string;
  parentId?: string | null;
  linkablePages?: WikiLinkPage[];
  initialDiscussions?: Discussion[];
  onSubmit: (data: {
    slug: string;
    title: string;
    icon?: string | null;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedVersion?: number;
    expectedUpdatedAt?: string;
    baseTitle?: string;
    baseIcon?: string | null;
    baseContent?: string;
    baseSlug?: string;
    baseParentId?: string | null;
  }) => Promise<WikiSubmitResult>;
}

const STATUS_LABEL: Record<string, string> = {
  unsaved: "未保存",
  saving: "保存中...",
  saved: "已保存",
  error: "保存失败",
};

interface WikiDraftSnapshot {
  slug: string;
  title: string;
  icon: string | null;
  content: string;
  parentId: string | null;
  editSummary: string;
}

interface ConflictFallback {
  title: string;
  icon: string | null;
  slug: string;
  parentId: string | null;
  version: number | undefined;
  updatedAt: string | undefined;
}

function buildConflictFromResult(
  result: WikiSubmitResult,
  fallback: ConflictFallback,
): EditConflict | null {
  if (!result.conflict || result.theirContent === undefined) return null;
  const theirVersion = result.theirVersion ?? fallback.version;
  const theirUpdatedAt = result.theirUpdatedAt ?? fallback.updatedAt;
  if (theirVersion === undefined || !theirUpdatedAt) return null;

  return {
    theirContent: result.theirContent,
    theirTitle: result.theirTitle ?? fallback.title,
    theirIcon:
      result.theirIcon !== undefined ? result.theirIcon : fallback.icon,
    theirSlug: result.theirSlug ?? fallback.slug,
    theirParentId:
      result.theirParentId !== undefined
        ? result.theirParentId
        : fallback.parentId,
    theirVersion,
    theirUpdatedAt,
  };
}

function serializeDraftSnapshot(snapshot: WikiDraftSnapshot) {
  return JSON.stringify(snapshot);
}

function parseDraftSnapshot(snapshot: string): WikiDraftSnapshot {
  return JSON.parse(snapshot) as WikiDraftSnapshot;
}

interface AppNavigateEvent extends Event {
  canIntercept: boolean;
  destination: { url: string };
  downloadRequest: string | null;
  hashChange: boolean;
  intercept(options: { precommitHandler: () => Promise<void> }): void;
}

interface AppNavigation {
  addEventListener(type: "navigate", listener: (event: Event) => void): void;
  removeEventListener(type: "navigate", listener: (event: Event) => void): void;
}

export function WikiEditor({
  mode,
  pageId,
  initialTitle = "",
  initialIcon = null,
  initialValue,
  initialSlug = "",
  expectedVersion,
  expectedUpdatedAt,
  parentId,
  linkablePages = [],
  initialDiscussions = [],
  onSubmit,
}: WikiEditorProps) {
  // Stabilize node ids across the SSR render and the client hydration of this
  // `"use client"` editor: both passes normalize the same initialValue prop to
  // identical deterministic ids, so React sees no hydration mismatch (#204).
  // The editor value, the autosave dirty-baseline (`content`), and the
  // three-way-merge base (`baseContentRef`) all derive from this one value so
  // they never disagree.
  const normalizedInitialValue = useMemo(
    () => normalizeInitialValue(initialValue),
    [initialValue],
  );
  // The visible document is also the autosave and three-way-merge baseline.
  // Legacy duplicate title headings are intentionally absent from every side
  // of a later merge, so unrelated block edits still merge cleanly.
  const initialContent = useMemo(
    () => JSON.stringify(normalizedInitialValue),
    [normalizedInitialValue],
  );
  const initialDraftSnapshot = useMemo(
    () =>
      serializeDraftSnapshot({
        slug: initialSlug,
        title: initialTitle,
        icon: initialIcon,
        content: initialContent,
        parentId: parentId ?? null,
        editSummary: "",
      }),
    [initialContent, initialIcon, initialSlug, initialTitle, parentId],
  );

  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState(initialIcon);
  const [slug, setSlug] = useState(initialSlug);
  const [selectedParentId, setSelectedParentId] = useState(parentId ?? "");
  const [editSummary, setEditSummary] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<EditConflict | null>(null);
  const [autosaveConflict, setAutosaveConflict] = useState(false);
  const [mobileEditorFocused, setMobileEditorFocused] = useState(false);
  const mobileFileDialogOpenRef = useRef(false);
  const handleMobileFileDialogChange = useCallback((open: boolean) => {
    mobileFileDialogOpenRef.current = open;
  }, []);
  const pendingConflictRef = useRef<EditConflict | null>(null);
  const router = useRouter();
  const { ensureContributorSetup } = useContributorSetup();
  const replaceEditorUrl = useCallback(
    (nextSlug: string) => {
      if (mode !== "edit" || !nextSlug) return;
      const nextUrl = new URL(window.location.href);
      nextUrl.pathname = `/wiki/edit/${nextSlug}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    },
    [mode],
  );
  const handleMobileEditorBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const staysInEditorContext = (target: EventTarget | null) =>
        target instanceof Element &&
        Boolean(
          target.closest('[data-slate-editor="true"]') ||
          target.closest('[data-mobile-editor-chrome="true"]') ||
          target.matches('input[type="file"]'),
        );

      if (mobileFileDialogOpenRef.current) return;
      if (staysInEditorContext(event.relatedTarget)) return;

      requestAnimationFrame(() => {
        if (staysInEditorContext(document.activeElement)) return;
        setMobileEditorFocused(false);
      });
    },
    [],
  );
  const selectedParent = linkablePages.find(
    (page) => page.id === selectedParentId,
  );
  const versionBaselineRef = useRef(expectedVersion);
  const updatedAtBaselineRef = useRef(expectedUpdatedAt);
  const baseTitleRef = useRef(initialTitle);
  const baseIconRef = useRef(initialIcon);
  const baseContentRef = useRef(initialContent);
  const baseSlugRef = useRef(initialSlug);
  const baseParentIdRef = useRef(parentId ?? null);
  const titleRef = useRef(initialTitle);
  const iconRef = useRef(initialIcon);
  const slugRef = useRef(initialSlug);
  const parentIdRef = useRef(parentId ?? "");
  const editSummaryRef = useRef("");
  const autosaveEnabled = mode === "edit" && Boolean(pageId);
  const sharePage = useCallback(async () => {
    if (mode !== "edit" || !slugRef.current) return;

    const url = new URL(`/wiki/${slugRef.current}`, window.location.origin)
      .href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: title || "未命名",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("页面链接已复制");
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }
      toast.error("无法分享页面");
    }
  }, [mode, title]);

  const editor = usePlateEditor({
    plugins: [
      ...BasicNodesKit,
      ...BlockSelectionKit,
      ...CalloutKit,
      ...CodeBlockKit,
      ...CommentKit,
      ...LinkKit,
      ...ListKit,
      ...MathKit,
      ...MediaKit,
      ...TableKit,
      ...TocKit,
      ...SlashKit,
      ...WikiLinkKit,
      ...DndKit,
      ...FloatingToolbarKit,
      ...MarkdownKit,
    ],
    value: normalizedInitialValue,
  });
  const cancelMobileCommentDraft = useCallback(() => {
    clearDraftCommentMarks(editor);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        editor.tf.focus({ retries: 5 });
      });
    });
  }, [editor]);

  const save = useCallback(
    async (nextSnapshot: string, reason: AutosaveSaveReason = "explicit") => {
      const next = parseDraftSnapshot(nextSnapshot);
      const result = await onSubmit({
        slug: next.slug,
        title: next.title,
        icon: next.icon,
        content: next.content,
        editSummary: next.editSummary || undefined,
        parentId: next.parentId,
        expectedVersion: versionBaselineRef.current,
        expectedUpdatedAt: updatedAtBaselineRef.current,
        baseTitle: baseTitleRef.current,
        baseIcon: baseIconRef.current,
        baseContent: baseContentRef.current,
        baseSlug: baseSlugRef.current,
        baseParentId: baseParentIdRef.current,
      });
      // A clean three-way merge advances the baseline to the new revision.
      if (result.version !== undefined && result.updatedAt) {
        const authoritativeTitle = result.title ?? next.title;
        const authoritativeIcon =
          result.icon !== undefined ? result.icon : next.icon;
        const authoritativeContent = result.content ?? next.content;
        const authoritativeSlug = result.slug ?? next.slug;
        const authoritativeParentId =
          result.parentId !== undefined ? result.parentId : next.parentId;
        const currentTitle = titleRef.current;
        const currentIcon = iconRef.current;
        const currentContent = serializeContentWithoutDraftComments(
          editor.children,
        );
        const currentSlug = slugRef.current;
        const currentParentId = parentIdRef.current || null;
        const currentEditSummary = editSummaryRef.current;
        const titleDrifted = currentTitle !== next.title;
        const iconDrifted = currentIcon !== next.icon;
        const contentDrifted = currentContent !== next.content;
        const slugDrifted = currentSlug !== next.slug;
        const parentDrifted = currentParentId !== next.parentId;
        const summaryDrifted = currentEditSummary !== next.editSummary;

        // Never let a delayed response overwrite edits made while its request
        // was in flight. When either field drifted, deliberately retain the
        // stale optimistic-lock timestamp: the autosave drain will submit the
        // latest draft again and the server can three-way merge it against the
        // authoritative revision.
        if (
          !titleDrifted &&
          !iconDrifted &&
          !contentDrifted &&
          !slugDrifted &&
          !parentDrifted &&
          !summaryDrifted
        ) {
          versionBaselineRef.current = result.version;
          updatedAtBaselineRef.current = result.updatedAt;
        }

        if (!titleDrifted) {
          titleRef.current = authoritativeTitle;
          baseTitleRef.current = authoritativeTitle;
          setTitle(authoritativeTitle);
        } else if (authoritativeTitle === next.title) {
          // The server did not change this field; use the persisted request as
          // the field ancestor so the trailing local edit is not a conflict.
          baseTitleRef.current = authoritativeTitle;
        }

        if (!iconDrifted) {
          iconRef.current = authoritativeIcon;
          baseIconRef.current = authoritativeIcon;
          setIcon(authoritativeIcon);
        } else if (authoritativeIcon === next.icon) {
          baseIconRef.current = authoritativeIcon;
        }

        if (!contentDrifted) {
          baseContentRef.current = authoritativeContent;
          if (authoritativeContent !== next.content) {
            editor.tf.setValue(parseContent(authoritativeContent));
          }
        } else if (authoritativeContent === next.content) {
          baseContentRef.current = authoritativeContent;
        }

        if (!slugDrifted) {
          slugRef.current = authoritativeSlug;
          baseSlugRef.current = authoritativeSlug;
          setSlug(authoritativeSlug);
        } else if (authoritativeSlug === next.slug) {
          baseSlugRef.current = authoritativeSlug;
        }
        replaceEditorUrl(authoritativeSlug);

        if (!parentDrifted) {
          const nextParentValue = authoritativeParentId ?? "";
          parentIdRef.current = nextParentValue;
          baseParentIdRef.current = authoritativeParentId;
          setSelectedParentId(nextParentValue);
        } else if (authoritativeParentId === next.parentId) {
          baseParentIdRef.current = authoritativeParentId;
        }

        pendingConflictRef.current = null;
        setAutosaveConflict(false);
        setError("");
        return {
          ...result,
          content: serializeDraftSnapshot({
            slug: authoritativeSlug,
            title: authoritativeTitle,
            icon: authoritativeIcon,
            content: authoritativeContent,
            parentId: authoritativeParentId,
            editSummary: next.editSummary,
          }),
        };
      }
      if (result.conflict) {
        pendingConflictRef.current = null;
        const nextConflict = buildConflictFromResult(result, {
          title: next.title,
          icon: next.icon,
          slug: next.slug,
          parentId: next.parentId,
          version: versionBaselineRef.current,
          updatedAt: updatedAtBaselineRef.current,
        });
        if (!nextConflict) {
          return {
            ...result,
            conflict: false,
            error: "EDIT_CONFLICT_RESPONSE_INVALID",
            haltAutosave: true,
          };
        }
        pendingConflictRef.current = nextConflict;
        if (reason === "explicit") {
          setAutosaveConflict(false);
          setConflict(nextConflict);
        } else {
          setAutosaveConflict(true);
        }
        // Surface as an error so autosave halts rather than dropping the edit.
        return {
          ...result,
          error: "EDIT_CONFLICT",
          haltAutosave: true,
        };
      }
      return result;
    },
    [onSubmit, editor, replaceEditorUrl],
  );

  // Serialize the document only when a save fires, never per keystroke — the
  // editor holds the source of truth in `editor.children` and the hook pulls it
  // lazily. This keeps typing off the React render path (#205).
  const autosave = useAutosave({
    getContent: () =>
      serializeDraftSnapshot({
        slug: slugRef.current,
        title: titleRef.current,
        icon: iconRef.current,
        content: serializeContentWithoutDraftComments(editor.children),
        parentId: parentIdRef.current || null,
        editSummary: editSummaryRef.current,
      }),
    onSave: save,
    initialContent: initialDraftSnapshot,
    enabled: autosaveEnabled,
  });
  // Stable across renders (memoized inside the hook); safe as an effect/callback dep.
  const { resetBaseline: resetAutosaveBaseline } = autosave;
  const { flush: flushAutosave } = autosave;
  const createDraftDirtyRef = useRef(false);
  useEffect(() => {
    createDraftDirtyRef.current = mode === "create" && autosave.isDirty;
  }, [autosave.isDirty, mode]);
  const surfaceAutosaveFailure = useCallback((saveError: string) => {
    if (saveError === "EDIT_PERMISSION_DENIED") {
      setError("编辑权限不足，请联系管理员。");
      return;
    }
    if (saveError === "EDIT_CONFLICT") {
      const pendingConflict = pendingConflictRef.current;
      if (pendingConflict) {
        setAutosaveConflict(false);
        setConflict(pendingConflict);
      }
      return;
    }
    setError("保存失败，请检查网络后重试。");
  }, []);
  const navigationFlushRef = useRef<Promise<boolean> | null>(null);
  const flushBeforeNavigation = useCallback(() => {
    if (navigationFlushRef.current) return navigationFlushRef.current;

    const request = (async () => {
      setError("");
      setSubmitting(true);
      const outcome = await flushAutosave();
      setSubmitting(false);
      if (outcome.status === "error") {
        surfaceAutosaveFailure(outcome.error);
        return false;
      }
      // Let React commit the autosave "saved" state and remove the hook's
      // beforeunload guard before the intercepted document navigation resumes.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return true;
    })().finally(() => {
      if (navigationFlushRef.current === request) {
        navigationFlushRef.current = null;
      }
    });
    navigationFlushRef.current = request;
    return request;
  }, [flushAutosave, surfaceAutosaveFailure]);
  const bypassNavigationUrlRef = useRef<string | null>(null);
  const prepareForNavigation = useCallback(async () => {
    if (mode === "create") {
      if (!createDraftDirtyRef.current) return true;
      return window.confirm("此页面尚未保存，确定要离开并放弃这些更改吗？");
    }
    return flushBeforeNavigation();
  }, [flushBeforeNavigation, mode]);
  const navigationProtectionEnabled =
    autosaveEnabled || (mode === "create" && autosave.isDirty);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    if (!(await ensureContributorSetup())) return;
    setSubmitting(true);

    if (autosaveEnabled) {
      const outcome = await flushAutosave();
      setSubmitting(false);
      if (outcome.status === "error") {
        surfaceAutosaveFailure(outcome.error);
        return;
      }
      router.push(`/wiki/${slugRef.current}`);
      return;
    }

    const result = await save(
      serializeDraftSnapshot({
        slug: slugRef.current,
        title: titleRef.current,
        icon: iconRef.current,
        content: serializeContentWithoutDraftComments(editor.children),
        parentId: parentIdRef.current || null,
        editSummary: editSummaryRef.current,
      }),
    );

    if (result.conflict) {
      setSubmitting(false);
      return;
    }
    if (result.error === "EDIT_PERMISSION_DENIED") {
      setError("编辑权限不足，请联系管理员。");
      setSubmitting(false);
      return;
    }
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    createDraftDirtyRef.current = false;
    resetAutosaveBaseline(
      serializeDraftSnapshot({
        slug: slugRef.current,
        title: titleRef.current,
        icon: iconRef.current,
        content: serializeContentWithoutDraftComments(editor.children),
        parentId: parentIdRef.current || null,
        editSummary: editSummaryRef.current,
      }),
    );
    router.push(`/wiki/${result.slug}`);
  }, [
    title,
    autosaveEnabled,
    flushAutosave,
    save,
    editor,
    router,
    ensureContributorSetup,
    resetAutosaveBaseline,
    surfaceAutosaveFailure,
  ]);

  const keepMine = useCallback(async () => {
    if (!conflict) return;
    if (!(await ensureContributorSetup())) return;
    setError("");
    setSubmitting(true);
    versionBaselineRef.current = conflict.theirVersion;
    updatedAtBaselineRef.current = conflict.theirUpdatedAt;
    baseTitleRef.current = conflict.theirTitle;
    baseIconRef.current = conflict.theirIcon;
    baseContentRef.current = conflict.theirContent;
    baseSlugRef.current = conflict.theirSlug;
    baseParentIdRef.current = conflict.theirParentId;
    const nextSnapshot = serializeDraftSnapshot({
      slug: slugRef.current,
      title: titleRef.current,
      icon: iconRef.current,
      content: serializeContentWithoutDraftComments(editor.children),
      parentId: parentIdRef.current || null,
      editSummary: editSummaryRef.current,
    });
    const result = await save(nextSnapshot);
    if (result.error) {
      surfaceAutosaveFailure(result.error);
      setSubmitting(false);
      return;
    }
    const savedSlug = result.slug ?? slugRef.current;
    pendingConflictRef.current = null;
    setAutosaveConflict(false);
    resetAutosaveBaseline(result.content ?? nextSnapshot);
    setConflict(null);
    setSubmitting(false);
    bypassNavigationUrlRef.current = new URL(
      `/wiki/${savedSlug}`,
      window.location.origin,
    ).href;
    router.push(`/wiki/${savedSlug}`);
  }, [
    conflict,
    save,
    editor,
    router,
    ensureContributorSetup,
    resetAutosaveBaseline,
    surfaceAutosaveFailure,
  ]);

  const discardMine = useCallback(() => {
    if (!conflict) return;
    editor.tf.setValue(parseContent(conflict.theirContent));
    titleRef.current = conflict.theirTitle;
    iconRef.current = conflict.theirIcon;
    setTitle(conflict.theirTitle);
    setIcon(conflict.theirIcon);
    versionBaselineRef.current = conflict.theirVersion;
    updatedAtBaselineRef.current = conflict.theirUpdatedAt;
    baseTitleRef.current = conflict.theirTitle;
    baseIconRef.current = conflict.theirIcon;
    baseContentRef.current = conflict.theirContent;
    baseSlugRef.current = conflict.theirSlug;
    baseParentIdRef.current = conflict.theirParentId;
    slugRef.current = conflict.theirSlug;
    parentIdRef.current = conflict.theirParentId ?? "";
    setSlug(conflict.theirSlug);
    setSelectedParentId(conflict.theirParentId ?? "");
    replaceEditorUrl(conflict.theirSlug);
    pendingConflictRef.current = null;
    setAutosaveConflict(false);
    resetAutosaveBaseline(
      serializeDraftSnapshot({
        slug: conflict.theirSlug,
        title: conflict.theirTitle,
        icon: conflict.theirIcon,
        content: conflict.theirContent,
        parentId: conflict.theirParentId,
        editSummary: editSummaryRef.current,
      }),
    );
    setConflict(null);
  }, [conflict, editor, replaceEditorUrl, resetAutosaveBaseline]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (autosaveEnabled) void autosave.save();
        else void handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [autosaveEnabled, autosave, handleSubmit]);

  useEffect(() => {
    if (!navigationProtectionEnabled) return;

    const handleAnchorClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !target ||
        target.target === "_blank" ||
        target.hasAttribute("download")
      ) {
        return;
      }
      const destination = new URL(target.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      ) {
        return;
      }

      // Own same-origin links while the editor is mounted. Starting a fresh
      // router navigation after the flush preserves the browser's default
      // destination without converting a document navigation into a blank
      // same-document Navigation API transition.
      event.preventDefault();
      event.stopPropagation();
      void prepareForNavigation().then((ready) => {
        if (!ready) return;
        bypassNavigationUrlRef.current = destination.href;
        router.push(
          `${destination.pathname}${destination.search}${destination.hash}`,
        );
      });
    };
    document.addEventListener("click", handleAnchorClick, true);

    // Keep one same-URL entry in front of the editor. A Back gesture first
    // lands on the editor's base entry, where popstate can await persistence
    // (or ask before abandoning a new page) before allowing the real traversal.
    // This is also the safety path for browsers without Navigation API.
    const guardToken = crypto.randomUUID();
    window.history.pushState(
      {
        ...window.history.state,
        cupediaEditorNavigationGuardToken: guardToken,
      },
      "",
      window.location.href,
    );
    const guardedEditorUrl = window.location.href;
    let handlingGuardTraversal = false;
    let allowNextNavigation = false;
    let traversingAfterPrepare = false;

    const handleGuardPopState = (event: PopStateEvent) => {
      if (traversingAfterPrepare) {
        if (window.location.href === guardedEditorUrl) {
          allowNextNavigation = true;
          window.history.back();
        }
        return;
      }
      const nextToken = (
        event.state as {
          cupediaEditorNavigationGuardToken?: string;
        } | null
      )?.cupediaEditorNavigationGuardToken;
      if (nextToken === guardToken || handlingGuardTraversal) return;

      handlingGuardTraversal = true;
      void prepareForNavigation().then((ready) => {
        if (!ready) {
          window.history.pushState(
            {
              ...window.history.state,
              cupediaEditorNavigationGuardToken: guardToken,
            },
            "",
            window.location.href,
          );
          handlingGuardTraversal = false;
          return;
        }
        traversingAfterPrepare = true;
        allowNextNavigation = true;
        window.history.back();
      });
    };
    window.addEventListener("popstate", handleGuardPopState);

    const navigation = (window as Window & { navigation?: AppNavigation })
      .navigation;
    let handleNavigate: ((rawEvent: Event) => void) | null = null;
    if (
      navigation &&
      "NavigateEvent" in window &&
      "NavigationPrecommitController" in window
    ) {
      handleNavigate = (rawEvent: Event) => {
        const event = rawEvent as AppNavigateEvent;
        if (allowNextNavigation) {
          allowNextNavigation = false;
          return;
        }
        if (bypassNavigationUrlRef.current === event.destination.url) {
          bypassNavigationUrlRef.current = null;
          return;
        }
        if (
          !event.canIntercept ||
          !event.cancelable ||
          event.hashChange ||
          event.downloadRequest !== null
        ) {
          return;
        }

        const current = new URL(window.location.href);
        const destination = new URL(event.destination.url);
        if (
          destination.origin !== current.origin ||
          destination.href === current.href
        ) {
          return;
        }

        event.intercept({
          precommitHandler: async () => {
            // Next may dispatch the Navigation event while React is committing
            // router state. Yield before touching editor state so this never
            // schedules an update from inside React's insertion effects.
            await Promise.resolve();
            if (await prepareForNavigation()) return;
            throw new DOMException(
              "Navigation canceled because autosave failed",
              "AbortError",
            );
          },
        });
      };

      navigation.addEventListener("navigate", handleNavigate);
    }

    return () => {
      if (handleNavigate) {
        navigation?.removeEventListener("navigate", handleNavigate);
      }
      window.removeEventListener("popstate", handleGuardPopState);
      document.removeEventListener("click", handleAnchorClick, true);
    };
  }, [navigationProtectionEnabled, prepareForNavigation, router]);

  return (
    <Plate editor={editor} onValueChange={() => autosave.notifyChange()}>
      <WikiLinkPagesProvider pages={linkablePages}>
        <DiscussionProvider
          pageId={pageId ?? ""}
          initialDiscussions={initialDiscussions}
        >
          <div
            data-testid="wiki-editor-shell"
            data-autosave-status={autosave.status}
            className="flex min-h-dvh min-w-0 flex-1 flex-col bg-background dark:bg-[#191919]"
          >
            <header
              role="banner"
              aria-label="编辑器顶栏"
              className="sticky top-0 z-30 flex h-[calc(2.75rem+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-2 border-b border-black/[0.08] bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-sm dark:border-white/[0.09] dark:bg-[#191919]"
            >
              <div className="flex min-w-0 items-center gap-1">
                <SidebarMobileToggle editor />
                <Link
                  href={mode === "edit" ? `/wiki/${slug}` : "/wiki"}
                  aria-label="返回 Wiki"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "icon-lg",
                    className: "text-muted-foreground max-md:hidden",
                  })}
                >
                  <ChevronLeftIcon aria-hidden="true" className="size-[18px]" />
                </Link>
                <div className="flex min-w-0 items-center gap-1 text-[17px] text-foreground md:text-sm">
                  {selectedParent && (
                    <>
                      <Link
                        href={`/wiki/${selectedParent.slug}`}
                        className="hidden max-w-36 truncate rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline"
                      >
                        {selectedParent.title}
                      </Link>
                      <span aria-hidden="true" className="hidden sm:inline">
                        /
                      </span>
                    </>
                  )}
                  {icon && (
                    <span aria-hidden="true" className="shrink-0 leading-none">
                      {icon}
                    </span>
                  )}
                  <span className="truncate">
                    {mode === "edit" ? title || "未命名" : "新建页面"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {autosaveEnabled &&
                  autosave.status !== "idle" &&
                  !autosaveConflict &&
                  !conflict && (
                    <span
                      data-testid="wiki-autosave-status"
                      role="status"
                      aria-label="保存状态"
                      className="hidden text-xs text-muted-foreground sm:inline"
                    >
                      {STATUS_LABEL[autosave.status]}
                    </span>
                  )}
                {mode === "edit" && initialSlug && (
                  <button
                    type="button"
                    aria-label="分享页面"
                    onClick={() => void sharePage()}
                    className="flex size-11 touch-manipulation items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:hidden"
                  >
                    <ShareIcon
                      aria-hidden="true"
                      className="size-6 stroke-[1.8]"
                    />
                  </button>
                )}
                {mode === "edit" && pageId && (
                  <div className="hidden md:block">
                    <DiscussionPanelTrigger compact />
                  </div>
                )}
                <Popover>
                  <PopoverTrigger
                    aria-label="页面设置"
                    className="flex size-11 touch-manipulation items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none md:size-8 md:text-muted-foreground md:hover:text-foreground"
                  >
                    <EllipsisIcon
                      aria-hidden="true"
                      className="size-[22px] md:size-4"
                    />
                  </PopoverTrigger>
                  <PopoverContent
                    aria-label="页面设置"
                    align="end"
                    sideOffset={8}
                    className="w-[min(22rem,calc(100vw-1rem))] gap-4 p-4"
                  >
                    <PopoverHeader>
                      <PopoverTitle>页面设置</PopoverTitle>
                    </PopoverHeader>
                    <div className="space-y-2">
                      <Label htmlFor="slug">URL 路径</Label>
                      <Input
                        id="slug"
                        value={slug}
                        onChange={(event) => {
                          slugRef.current = event.target.value;
                          setSlug(event.target.value);
                          autosave.notifyChange();
                        }}
                        placeholder="e.g. octopus"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="parent-page">父页面</Label>
                      <select
                        id="parent-page"
                        value={selectedParentId}
                        onChange={(event) => {
                          parentIdRef.current = event.target.value;
                          setSelectedParentId(event.target.value);
                          autosave.notifyChange();
                        }}
                        className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
                      >
                        <option value="">无父页面</option>
                        {linkablePages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="summary">编辑摘要（可选）</Label>
                      <Textarea
                        id="summary"
                        value={editSummary}
                        onChange={(event) => {
                          editSummaryRef.current = event.target.value;
                          setEditSummary(event.target.value);
                          autosave.notifyChange();
                        }}
                        placeholder="简要描述你的修改"
                        rows={3}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={
                    mode === "edit" ? "hidden md:inline-flex" : undefined
                  }
                >
                  {submitting ? "完成中…" : "完成"}
                </Button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <div
                data-testid="wiki-editor-scroll-container"
                className="min-w-0 flex-1 scroll-pb-24 overflow-y-auto"
              >
                <article
                  data-testid="wiki-editor-document"
                  className="flex w-full flex-col px-6 pt-6 pb-28 md:px-12 md:pt-13 lg:px-16 xl:px-24"
                >
                  <div
                    className={
                      icon ? "flex items-start gap-1 md:block" : "block"
                    }
                  >
                    <div className={icon ? "shrink-0 md:mb-2" : "mb-2"}>
                      <WikiIconPicker
                        icon={icon}
                        mobileInline={Boolean(icon)}
                        onIconChange={(nextIcon) => {
                          iconRef.current = nextIcon;
                          setIcon(nextIcon);
                          autosave.notifyChange();
                        }}
                      />
                    </div>
                    <Input
                      id="title"
                      aria-label="页面标题"
                      value={title}
                      onChange={(e) => {
                        titleRef.current = e.target.value;
                        setTitle(e.target.value);
                        autosave.notifyChange();
                      }}
                      placeholder="无标题"
                      className="block h-[38px] min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[32px]! leading-[38px] font-bold tracking-[-0.025em] shadow-none focus-visible:border-transparent focus-visible:ring-0 md:h-[48px] md:text-[40px]! md:leading-[48px] dark:bg-transparent"
                    />
                  </div>

                  <div
                    data-testid="wiki-editor-canvas"
                    className="mt-[26px] min-h-[50dvh] md:mt-[30px]"
                  >
                    <EditorContainer className="overflow-visible">
                      <Editor
                        variant="none"
                        className="min-h-[50dvh] rounded-none pb-24 text-base leading-6 lg:overflow-x-visible"
                        placeholder="开始编辑..."
                        onFocus={() => setMobileEditorFocused(true)}
                        onBlur={handleMobileEditorBlur}
                      />
                    </EditorContainer>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      aria-label="保存错误"
                      className="mt-4 text-sm text-red-500"
                    >
                      {error}
                    </p>
                  )}
                  {autosaveConflict && !conflict && (
                    <div
                      role="status"
                      aria-label="自动保存已暂停"
                      className="mt-4 flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-300"
                    >
                      <span>服务器版本已更新，自动保存已暂停。</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const pendingConflict = pendingConflictRef.current;
                          if (!pendingConflict) return;
                          setAutosaveConflict(false);
                          setConflict(pendingConflict);
                        }}
                      >
                        处理冲突
                      </Button>
                    </div>
                  )}
                </article>
              </div>

              {mode === "edit" && pageId && (
                <ResponsiveDiscussionPanel
                  variant="editor"
                  onCancelDraft={cancelMobileCommentDraft}
                >
                  <DiscussionSidebar pageId={pageId} compactComposer />
                </ResponsiveDiscussionPanel>
              )}
            </div>

            <MobileWikiEditorToolbar
              visible={mobileEditorFocused}
              onDismiss={() => setMobileEditorFocused(false)}
              onFileDialogChange={handleMobileFileDialogChange}
            />

            {conflict && (
              <EditConflictDialog
                fields={[
                  {
                    label: "标题",
                    mine: title || "未命名",
                    theirs: conflict.theirTitle || "未命名",
                  },
                  {
                    label: "图标",
                    mine: icon ?? "无",
                    theirs: conflict.theirIcon ?? "无",
                  },
                  {
                    label: "URL 路径",
                    mine: slug,
                    theirs: conflict.theirSlug,
                  },
                  {
                    label: "父页面",
                    mine: selectedParent?.title ?? "无",
                    theirs:
                      linkablePages.find(
                        (page) => page.id === conflict.theirParentId,
                      )?.title ?? (conflict.theirParentId ? "其他页面" : "无"),
                  },
                ].filter((field) => field.mine !== field.theirs)}
                mineText={extractText(
                  serializeContentWithoutDraftComments(editor.children),
                )}
                theirText={extractText(conflict.theirContent)}
                saving={submitting}
                onKeepMine={() => void keepMine()}
                onDiscard={discardMine}
                onCancel={() => {
                  setError("");
                  setConflict(null);
                  setAutosaveConflict(Boolean(pendingConflictRef.current));
                }}
              />
            )}
          </div>
        </DiscussionProvider>
      </WikiLinkPagesProvider>
    </Plate>
  );
}
