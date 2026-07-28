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
import { useWikiDraft } from "@/hooks/use-wiki-draft";

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
import { useOptionalWikiTree } from "@/components/wiki/wiki-tree-provider";
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
import { getWikiDisplayTitle } from "@/lib/wiki-title";
import type {
  WikiDraftClassification,
  WikiDraftRecord,
} from "@/lib/wiki-draft";
import { formatWikiContentForDiff } from "@/lib/wiki-draft";
import {
  extractText,
  normalizeInitialValue,
  parseContent,
  type PlateValue,
} from "@/lib/plate-utils";

interface WikiSubmitResult {
  error?: string;
  haltAutosave?: boolean;
  id?: string;
  parentId?: string | null;
  title?: string;
  icon?: string | null;
  content?: string;
  version?: number;
  contentGeneration?: number;
  updatedAt?: string;
  conflict?: boolean;
  theirContent?: string;
  theirTitle?: string;
  theirIcon?: string | null;
  theirParentId?: string | null;
  theirVersion?: number;
  theirContentGeneration?: number;
  theirUpdatedAt?: string;
}

export interface WikiEditorProps {
  mode: "create" | "edit";
  userId?: string;
  pageId?: string;
  initialTitle?: string;
  initialIcon?: string | null;
  initialValue?: PlateValue;
  expectedVersion?: number;
  expectedContentGeneration?: number;
  expectedUpdatedAt?: string;
  parentId?: string | null;
  linkablePages?: WikiLinkPage[];
  initialDiscussions?: Discussion[];
  draftMode?: boolean;
  canDelete?: boolean;
  onDelete?: () => Promise<void>;
  onInitialize?: () => Promise<WikiSubmitResult>;
  onPublish?: () => Promise<WikiSubmitResult>;
  onSubmit: (data: {
    title: string;
    icon?: string | null;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedVersion?: number;
    expectedContentGeneration?: number;
    expectedUpdatedAt?: string;
    baseTitle?: string;
    baseIcon?: string | null;
    baseContent?: string;
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
  title: string;
  icon: string | null;
  content: string;
  parentId: string | null;
  editSummary: string;
}

interface ConflictFallback {
  title: string;
  icon: string | null;
  parentId: string | null;
  version: number | undefined;
  contentGeneration: number;
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
    theirParentId:
      result.theirParentId !== undefined
        ? result.theirParentId
        : fallback.parentId,
    theirVersion,
    theirContentGeneration:
      result.theirContentGeneration ?? fallback.contentGeneration,
    theirUpdatedAt,
  };
}

function serializeDraftSnapshot(snapshot: WikiDraftSnapshot) {
  return JSON.stringify(snapshot);
}

function parseDraftSnapshot(snapshot: string): WikiDraftSnapshot {
  return JSON.parse(snapshot) as WikiDraftSnapshot;
}

function tryParseDraftSnapshot(snapshot: string) {
  try {
    return parseDraftSnapshot(snapshot);
  } catch {
    return null;
  }
}

function draftSnapshotCopyText(snapshot: string) {
  const draft = tryParseDraftSnapshot(snapshot);
  if (!draft) return snapshot;
  return [draft.title || "未命名", extractText(draft.content)]
    .filter(Boolean)
    .join("\n\n");
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
  userId,
  pageId,
  initialTitle = "",
  initialIcon = null,
  initialValue,
  expectedVersion,
  expectedContentGeneration = 0,
  expectedUpdatedAt,
  parentId,
  linkablePages = [],
  initialDiscussions = [],
  draftMode = false,
  canDelete = false,
  onDelete,
  onInitialize,
  onPublish,
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
        title: initialTitle,
        icon: initialIcon,
        content: initialContent,
        parentId: parentId ?? null,
        editSummary: "",
      }),
    [initialContent, initialIcon, initialTitle, parentId],
  );

  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState(initialIcon);
  const [selectedParentId, setSelectedParentId] = useState(parentId ?? "");
  const [editSummary, setEditSummary] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [publishingPageId, setPublishingPageId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [conflict, setConflict] = useState<EditConflict | null>(null);
  const [autosaveConflict, setAutosaveConflict] = useState(false);
  const [draftRecovery, setDraftRecovery] = useState<{
    record: WikiDraftRecord;
    classification: Exclude<WikiDraftClassification, "none">;
  } | null>(null);
  const [mobileEditorFocused, setMobileEditorFocused] = useState(false);
  const markEditorHydrated = useCallback((element: HTMLDivElement | null) => {
    if (element) element.dataset.editorHydrated = "true";
  }, []);
  const mobileFileDialogOpenRef = useRef(false);
  const handleMobileFileDialogChange = useCallback((open: boolean) => {
    mobileFileDialogOpenRef.current = open;
  }, []);
  const pendingConflictRef = useRef<EditConflict | null>(null);
  const draftProjectedRef = useRef(false);
  const draftFallbackGuardRef = useRef<string | null>(null);
  const collapsingDraftGuardRef = useRef(false);
  const publishingRef = useRef<string | null>(null);
  const router = useRouter();
  const wikiTree = useOptionalWikiTree();
  const { ensureContributorSetup } = useContributorSetup();
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
  const editorLinkablePages =
    draftMode && wikiTree
      ? wikiTree.pages.filter((page) => page.id !== pageId)
      : linkablePages;
  const selectedParent = editorLinkablePages.find(
    (page) => page.id === selectedParentId,
  );
  const recoveredDraft = draftRecovery
    ? tryParseDraftSnapshot(draftRecovery.record.draftSnapshot)
    : null;
  const canAutoRecoverDraft =
    draftMode &&
    recoveredDraft !== null &&
    draftRecovery?.record.baseVersion === expectedVersion &&
    draftRecovery?.record.baseSnapshot === initialDraftSnapshot;
  const versionBaselineRef = useRef(expectedVersion);
  const contentGenerationRef = useRef(expectedContentGeneration);
  const updatedAtBaselineRef = useRef(expectedUpdatedAt);
  const baseTitleRef = useRef(initialTitle);
  const baseIconRef = useRef(initialIcon);
  const baseContentRef = useRef(initialContent);
  const baseParentIdRef = useRef(parentId ?? null);
  const titleRef = useRef(initialTitle);
  const iconRef = useRef(initialIcon);
  const parentIdRef = useRef(parentId ?? "");
  const editSummaryRef = useRef("");
  const initializationRef = useRef<Promise<WikiSubmitResult | null> | null>(
    null,
  );
  const autosaveEnabled = mode === "edit" && Boolean(pageId);
  const publishing = draftMode && publishingPageId === pageId;
  useEffect(() => {
    if (!draftMode || !pageId || !wikiTree || draftProjectedRef.current) {
      return;
    }
    draftProjectedRef.current = true;
    const mutationToken = wikiTree.projectUpsert({
      id: pageId,
      title: initialTitle,
      icon: initialIcon,
      parentId: parentId ?? null,
    });
    wikiTree.confirm(mutationToken);
  }, [draftMode, initialIcon, initialTitle, pageId, parentId, wikiTree]);
  const copyPageLink = useCallback(async () => {
    if (mode !== "edit" || !pageId) return;

    const url = new URL(`/wiki/${pageId}`, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("页面链接已复制");
    } catch {
      toast.error("无法复制页面链接");
    }
  }, [mode, pageId]);

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
  const getCurrentDraftSnapshot = useCallback(
    () =>
      serializeDraftSnapshot({
        title: titleRef.current,
        icon: iconRef.current,
        content: serializeContentWithoutDraftComments(editor.children),
        parentId: parentIdRef.current || null,
        editSummary: editSummaryRef.current,
      }),
    [editor],
  );
  const initializeDraft = useCallback(() => {
    if (!onInitialize) return Promise.resolve(null);
    if (initializationRef.current) return initializationRef.current;

    const request = onInitialize()
      .then((result) => {
        if (result.error) {
          initializationRef.current = null;
          return result;
        }
        if (result.version !== undefined && result.updatedAt) {
          versionBaselineRef.current = result.version;
          contentGenerationRef.current = result.contentGeneration ?? 0;
          updatedAtBaselineRef.current = result.updatedAt;
          baseTitleRef.current = result.title ?? initialTitle;
          baseIconRef.current =
            result.icon !== undefined ? result.icon : initialIcon;
          baseContentRef.current = result.content ?? initialContent;
          baseParentIdRef.current =
            result.parentId !== undefined
              ? result.parentId
              : (parentId ?? null);
        }
        return result;
      })
      .catch((error: unknown) => {
        initializationRef.current = null;
        throw error;
      });
    initializationRef.current = request;
    return request;
  }, [initialContent, initialIcon, initialTitle, onInitialize, parentId]);
  useEffect(() => {
    if (!draftMode || !onInitialize) return;
    const surfaceInitializationFailure = () => {
      setError("私有草稿尚未同步，内容会保留并在下次保存时重试。");
    };
    void initializeDraft().then((result) => {
      if (result?.error) surfaceInitializationFailure();
    }, surfaceInitializationFailure);
  }, [draftMode, initializeDraft, onInitialize]);
  const wikiDraft = useWikiDraft({
    enabled: autosaveEnabled && Boolean(userId && pageId),
    userId: userId ?? "",
    pageId: pageId ?? "",
    version: expectedVersion ?? 0,
    contentGeneration: expectedContentGeneration,
    snapshot: initialDraftSnapshot,
    getSnapshot: getCurrentDraftSnapshot,
    onRecovery: (record, classification) => {
      setDraftRecovery({ record, classification });
    },
  });
  const { flush: flushWikiDraft, rebase: rebaseWikiDraft } = wikiDraft;
  useEffect(() => {
    if (!draftMode || !onInitialize) return;
    void initializeDraft().then(
      (result) => {
        if (!result?.version || !result.updatedAt) return;
        void rebaseWikiDraft({
          version: result.version,
          contentGeneration: result.contentGeneration ?? 0,
          snapshot: serializeDraftSnapshot({
            title: result.title ?? initialTitle,
            icon: result.icon !== undefined ? result.icon : initialIcon,
            content: result.content ?? initialContent,
            parentId:
              result.parentId !== undefined
                ? result.parentId
                : (parentId ?? null),
            editSummary: "",
          }),
        }).catch(() => {});
      },
      () => {},
    );
  }, [
    draftMode,
    initialContent,
    initialIcon,
    initialTitle,
    initializeDraft,
    onInitialize,
    parentId,
    rebaseWikiDraft,
  ]);
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
      await wikiDraft.flush().catch(() => {});
      const mutationToken =
        pageId && wikiTree
          ? wikiTree.projectUpsert({
              id: pageId,
              title: next.title,
              icon: next.icon,
              parentId: next.parentId,
            })
          : null;
      let result: WikiSubmitResult;
      try {
        const initialization = await initializeDraft();
        if (initialization?.error) return initialization;
        result = await onSubmit({
          title: next.title,
          icon: next.icon,
          content: next.content,
          editSummary: next.editSummary || undefined,
          parentId: next.parentId,
          expectedVersion: versionBaselineRef.current,
          expectedContentGeneration: contentGenerationRef.current,
          expectedUpdatedAt: updatedAtBaselineRef.current,
          baseTitle: baseTitleRef.current,
          baseIcon: baseIconRef.current,
          baseContent: baseContentRef.current,
          baseParentId: baseParentIdRef.current,
        });
      } catch (error) {
        wikiTree?.rollback(mutationToken);
        throw error;
      }
      // A clean three-way merge advances the baseline to the new revision.
      if (result.version !== undefined && result.updatedAt) {
        const authoritativeTitle = result.title ?? next.title;
        const authoritativeIcon =
          result.icon !== undefined ? result.icon : next.icon;
        const authoritativeContent = result.content ?? next.content;
        const authoritativeParentId =
          result.parentId !== undefined ? result.parentId : next.parentId;
        const currentTitle = titleRef.current;
        const currentIcon = iconRef.current;
        const currentContent = serializeContentWithoutDraftComments(
          editor.children,
        );
        const currentParentId = parentIdRef.current || null;
        const currentEditSummary = editSummaryRef.current;
        const titleDrifted = currentTitle !== next.title;
        const iconDrifted = currentIcon !== next.icon;
        const contentDrifted = currentContent !== next.content;
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
          !parentDrifted &&
          !summaryDrifted
        ) {
          versionBaselineRef.current = result.version;
          updatedAtBaselineRef.current = result.updatedAt;
        }
        contentGenerationRef.current =
          result.contentGeneration ?? contentGenerationRef.current;

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
        wikiTree?.confirm(mutationToken, {
          id: pageId!,
          title: authoritativeTitle,
          icon: authoritativeIcon,
          parentId: authoritativeParentId,
        });
        const authoritativeSnapshot = serializeDraftSnapshot({
          title: authoritativeTitle,
          icon: authoritativeIcon,
          content: authoritativeContent,
          parentId: authoritativeParentId,
          editSummary: next.editSummary,
        });
        await wikiDraft
          .acknowledge(nextSnapshot, {
            version: result.version,
            contentGeneration:
              result.contentGeneration ?? contentGenerationRef.current,
            snapshot: authoritativeSnapshot,
          })
          .catch(() => {});
        return {
          ...result,
          content: authoritativeSnapshot,
        };
      }
      if (result.conflict) {
        wikiTree?.rollback(mutationToken);
        pendingConflictRef.current = null;
        const nextConflict = buildConflictFromResult(result, {
          title: next.title,
          icon: next.icon,
          parentId: next.parentId,
          version: versionBaselineRef.current,
          contentGeneration: contentGenerationRef.current,
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
      if (result.error) {
        wikiTree?.rollback(mutationToken);
        if (
          result.error === "EDIT_PERMISSION_DENIED" ||
          result.error === "Page not found"
        ) {
          return { ...result, haltAutosave: true };
        }
      } else {
        wikiTree?.confirm(mutationToken);
      }
      return result;
    },
    [editor, initializeDraft, onSubmit, pageId, wikiDraft, wikiTree],
  );

  // Serialize the document only when a save fires, never per keystroke — the
  // editor holds the source of truth in `editor.children` and the hook pulls it
  // lazily. This keeps typing off the React render path (#205).
  const autosave = useAutosave({
    getContent: getCurrentDraftSnapshot,
    onSave: save,
    initialContent: initialDraftSnapshot,
    enabled: autosaveEnabled,
  });
  const notifyChange = useCallback(() => {
    wikiDraft.notifyChange();
    autosave.notifyChange();
  }, [autosave, wikiDraft]);
  // Stable across renders (memoized inside the hook); safe as an effect/callback dep.
  const { resetBaseline: resetAutosaveBaseline } = autosave;
  const { flush: flushAutosave } = autosave;
  useEffect(() => {
    if (!canAutoRecoverDraft || !recoveredDraft) return;

    const frame = requestAnimationFrame(() => {
      titleRef.current = recoveredDraft.title;
      iconRef.current = recoveredDraft.icon;
      parentIdRef.current = recoveredDraft.parentId ?? "";
      editSummaryRef.current = recoveredDraft.editSummary;
      setTitle(recoveredDraft.title);
      setIcon(recoveredDraft.icon);
      setSelectedParentId(recoveredDraft.parentId ?? "");
      setEditSummary(recoveredDraft.editSummary);
      editor.tf.setValue(parseContent(recoveredDraft.content));

      wikiDraft.resume();
      setDraftRecovery(null);
      resetAutosaveBaseline(initialDraftSnapshot);
      notifyChange();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    canAutoRecoverDraft,
    editor,
    initialDraftSnapshot,
    notifyChange,
    recoveredDraft,
    resetAutosaveBaseline,
    wikiDraft,
  ]);
  const autosaveDirtyRef = useRef(autosave.isDirty);
  useEffect(() => {
    autosaveDirtyRef.current = autosave.isDirty;
  }, [autosave.isDirty]);
  const createDraftDirtyRef = useRef(false);
  useEffect(() => {
    createDraftDirtyRef.current = mode === "create" && autosave.isDirty;
  }, [autosave.isDirty, mode]);
  const surfaceAutosaveFailure = useCallback((saveError: string) => {
    if (saveError === "EDIT_PERMISSION_DENIED") {
      setError("编辑权限已失效。本地草稿仍保留，可复制后联系管理员。");
      return;
    }
    if (saveError === "Page not found") {
      setError("页面已被删除。本地草稿仍保留，可复制后另行保存。");
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
  useEffect(() => {
    const bypassCreatedPageNavigation = (event: Event) => {
      const destination = (event as CustomEvent<unknown>).detail;
      if (typeof destination !== "string") return;
      bypassNavigationUrlRef.current = new URL(
        destination,
        window.location.origin,
      ).href;
    };
    window.addEventListener(
      "cupedia:editor-navigation-bypass",
      bypassCreatedPageNavigation,
    );
    return () =>
      window.removeEventListener(
        "cupedia:editor-navigation-bypass",
        bypassCreatedPageNavigation,
      );
  }, []);
  const prepareForNavigation = useCallback(async () => {
    if (mode === "create") {
      if (!createDraftDirtyRef.current) return true;
      return window.confirm("此页面尚未保存，确定要离开并放弃这些更改吗？");
    }
    if (draftMode) {
      try {
        await flushWikiDraft();
      } catch {
        setError("本地草稿保存失败，请重试。");
        return false;
      }
      void flushAutosave().then((outcome) => {
        if (outcome.status === "error") {
          surfaceAutosaveFailure(outcome.error);
        }
      });
      return true;
    }
    return flushBeforeNavigation();
  }, [
    draftMode,
    flushAutosave,
    flushBeforeNavigation,
    flushWikiDraft,
    mode,
    surfaceAutosaveFailure,
  ]);
  // Install the history guard for the full editor lifetime. Mobile overlays
  // add their own temporary history entries, so mounting this guard only after
  // the first dirty change can put it above an already-open overlay and make
  // Back leave the page instead of closing that overlay.
  const navigationProtectionEnabled =
    autosaveEnabled || (mode === "create" && autosave.isDirty);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!(await ensureContributorSetup())) return;
    setSubmitting(true);

    if (autosaveEnabled) {
      const outcome = await flushAutosave();
      setSubmitting(false);
      if (outcome.status === "error") {
        surfaceAutosaveFailure(outcome.error);
        return;
      }
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setMobileEditorFocused(false);
      return;
    }

    const result = await save(
      serializeDraftSnapshot({
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
        title: titleRef.current,
        icon: iconRef.current,
        content: serializeContentWithoutDraftComments(editor.children),
        parentId: parentIdRef.current || null,
        editSummary: editSummaryRef.current,
      }),
    );
    const savedPageId = result.id ?? pageId;
    if (!savedPageId) {
      setError("页面已保存，但无法打开。请刷新后重试。");
      setSubmitting(false);
      return;
    }
    router.push(`/wiki/${savedPageId}`);
  }, [
    autosaveEnabled,
    pageId,
    flushAutosave,
    save,
    editor,
    router,
    ensureContributorSetup,
    resetAutosaveBaseline,
    surfaceAutosaveFailure,
  ]);

  const handlePublish = useCallback(async () => {
    if (!pageId || !onPublish || publishingRef.current === pageId) return;
    publishingRef.current = pageId;
    setError("");
    let contributorReady: boolean;
    try {
      contributorReady = await ensureContributorSetup();
    } catch {
      publishingRef.current = null;
      setPublishingPageId(null);
      setError("发布失败，请检查网络后重试。");
      return;
    }
    if (!contributorReady) {
      publishingRef.current = null;
      return;
    }
    setPublishingPageId(pageId);

    const outcome = await flushAutosave();
    if (outcome.status === "error") {
      publishingRef.current = null;
      setPublishingPageId(null);
      surfaceAutosaveFailure(outcome.error);
      return;
    }

    let result: WikiSubmitResult;
    try {
      result = await onPublish();
    } catch {
      publishingRef.current = null;
      setPublishingPageId(null);
      setError("发布失败，请检查网络后重试。");
      return;
    }
    if (result.error) {
      publishingRef.current = null;
      setPublishingPageId(null);
      setError(result.error);
      return;
    }

    setShareOpen(false);
    void wikiDraft.discard().catch(() => {});
    const destination = `/wiki/${result.id ?? pageId}`;
    const hasFallbackGuard = Boolean(draftFallbackGuardRef.current);
    if (hasFallbackGuard) {
      collapsingDraftGuardRef.current = true;
      await new Promise<void>((resolve) => {
        window.addEventListener("popstate", () => resolve(), { once: true });
        window.history.back();
      });
      collapsingDraftGuardRef.current = false;
      draftFallbackGuardRef.current = null;
    }
    if (hasFallbackGuard) {
      window.location.replace(destination);
      return;
    }
    window.dispatchEvent(
      new CustomEvent("cupedia:editor-navigation-bypass", {
        detail: destination,
      }),
    );
    router.replace(destination);
    router.refresh();
  }, [
    ensureContributorSetup,
    flushAutosave,
    onPublish,
    pageId,
    router,
    surfaceAutosaveFailure,
    wikiDraft,
  ]);

  const copyLocalSnapshot = useCallback(async (snapshot: string) => {
    try {
      await navigator.clipboard.writeText(draftSnapshotCopyText(snapshot));
      toast.success("本地内容已复制");
    } catch {
      toast.error("复制失败，请从对比内容中手动复制");
    }
  }, []);

  const adoptConflictServer = useCallback(
    async (discardLocal: boolean) => {
      if (!conflict) return;
      wikiDraft.suspend();
      const serverSnapshot = serializeDraftSnapshot({
        title: conflict.theirTitle,
        icon: conflict.theirIcon,
        content: conflict.theirContent,
        parentId: conflict.theirParentId,
        editSummary: editSummaryRef.current,
      });
      if (discardLocal) {
        await wikiDraft.discard();
      } else {
        await wikiDraft
          .rebase({
            version: conflict.theirVersion,
            contentGeneration: conflict.theirContentGeneration,
            snapshot: serverSnapshot,
          })
          .catch(() => {});
      }
      editor.tf.setValue(parseContent(conflict.theirContent));
      titleRef.current = conflict.theirTitle;
      iconRef.current = conflict.theirIcon;
      setTitle(conflict.theirTitle);
      setIcon(conflict.theirIcon);
      versionBaselineRef.current = conflict.theirVersion;
      contentGenerationRef.current = conflict.theirContentGeneration;
      updatedAtBaselineRef.current = conflict.theirUpdatedAt;
      baseTitleRef.current = conflict.theirTitle;
      baseIconRef.current = conflict.theirIcon;
      baseContentRef.current = conflict.theirContent;
      baseParentIdRef.current = conflict.theirParentId;
      parentIdRef.current = conflict.theirParentId ?? "";
      setSelectedParentId(conflict.theirParentId ?? "");
      pendingConflictRef.current = null;
      setAutosaveConflict(false);
      resetAutosaveBaseline(serverSnapshot);
      setConflict(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => wikiDraft.resume());
      });
    },
    [conflict, editor, resetAutosaveBaseline, wikiDraft],
  );

  const handleDeletePage = useCallback(async () => {
    if (!pageId || !onDelete || submitting) return;
    if (
      !window.confirm(
        "此页面及其子页面将移至回收站。指向它们的链接会保留，并显示“页面已删除”。确定继续吗？",
      )
    ) {
      return;
    }
    const mutationToken = wikiTree?.projectDelete(pageId) ?? null;
    setSubmitting(true);
    try {
      await onDelete();
      wikiTree?.confirm(mutationToken);
      const destination = "/wiki";
      window.dispatchEvent(
        new CustomEvent("cupedia:editor-navigation-bypass", {
          detail: destination,
        }),
      );
      router.push(destination);
    } catch {
      wikiTree?.rollback(mutationToken);
      setSubmitting(false);
      toast.error("删除页面失败，请重试");
    }
  }, [onDelete, pageId, router, submitting, wikiTree]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (autosaveEnabled) {
          void flushAutosave().then((outcome) => {
            if (outcome.status === "error") {
              surfaceAutosaveFailure(outcome.error);
            }
          });
        } else {
          void handleSubmit();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [autosaveEnabled, flushAutosave, handleSubmit, surfaceAutosaveFailure]);

  useEffect(() => {
    if (!navigationProtectionEnabled) return;

    const handleAnchorClick = (event: MouseEvent) => {
      if (!autosaveDirtyRef.current) return;
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

    const navigation = (window as Window & { navigation?: AppNavigation })
      .navigation;
    const supportsNavigationInterception = Boolean(
      navigation &&
      "NavigateEvent" in window &&
      "NavigationPrecommitController" in window,
    );
    // Keep one same-URL entry in front of the editor. A Back gesture first
    // lands on the editor's base entry, where popstate can await persistence
    // (or ask before abandoning a new page) before allowing the real traversal.
    // This is also the safety path for browsers without Navigation API.
    const guardToken =
      draftMode && supportsNavigationInterception ? null : crypto.randomUUID();
    draftFallbackGuardRef.current = draftMode ? guardToken : null;
    if (guardToken) {
      window.history.pushState(
        {
          ...window.history.state,
          cupediaEditorNavigationGuardToken: guardToken,
        },
        "",
        window.location.href,
      );
    }
    const guardedEditorUrl = window.location.href;
    let handlingGuardTraversal = false;
    let allowNextNavigation = false;
    let traversingAfterPrepare = false;

    const handleGuardPopState = (event: PopStateEvent) => {
      if (draftMode) {
        if (collapsingDraftGuardRef.current) return;
        if (!guardToken) {
          void prepareForNavigation();
          return;
        }
        if (handlingGuardTraversal) return;
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
          window.history.back();
        });
        return;
      }
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

    let handleNavigate: ((rawEvent: Event) => void) | null = null;
    if (navigation && supportsNavigationInterception) {
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
        if (!autosaveDirtyRef.current) return;
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
      if (draftFallbackGuardRef.current === guardToken) {
        draftFallbackGuardRef.current = null;
      }
    };
  }, [draftMode, navigationProtectionEnabled, prepareForNavigation, router]);

  return (
    <Plate
      editor={editor}
      onValueChange={() => {
        if (!editor.api.isComposing()) notifyChange();
      }}
    >
      <WikiLinkPagesProvider pages={editorLinkablePages}>
        <DiscussionProvider
          pageId={pageId ?? ""}
          initialDiscussions={initialDiscussions}
        >
          <div
            ref={markEditorHydrated}
            data-testid="wiki-editor-shell"
            data-autosave-status={autosave.status}
            aria-busy={publishing || undefined}
            inert={publishing}
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
                  href={mode === "edit" ? `/wiki/${pageId}` : "/wiki"}
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
                        href={`/wiki/${selectedParent.id}`}
                        className="hidden max-w-36 truncate rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline"
                      >
                        {getWikiDisplayTitle(selectedParent.title)}
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
                {mode === "edit" && pageId && (
                  <Popover open={shareOpen} onOpenChange={setShareOpen}>
                    <PopoverTrigger
                      aria-label="共享"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                        className:
                          "h-11 min-w-11 px-2.5 font-medium text-foreground md:h-8 md:min-w-0",
                      })}
                    >
                      <ShareIcon
                        aria-hidden="true"
                        className="size-6 stroke-[1.8] md:hidden"
                      />
                      <span className="hidden md:inline">共享</span>
                    </PopoverTrigger>
                    <PopoverContent
                      aria-label="共享此页面"
                      align="end"
                      sideOffset={8}
                      className="w-[min(22rem,calc(100vw-1rem))] gap-3 p-3"
                    >
                      <PopoverHeader className="px-1">
                        <PopoverTitle>共享此页面</PopoverTitle>
                      </PopoverHeader>
                      {draftMode && onPublish ? (
                        <div className="space-y-3 rounded-md bg-muted/55 p-3">
                          <div>
                            <div className="text-sm font-medium">
                              仅自己可见
                            </div>
                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              页面已自动保存。发布后，所有人都能在 Wiki 中查看。
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full"
                            onClick={() => void handlePublish()}
                            disabled={publishing || submitting || !title.trim()}
                          >
                            {publishing ? "发布中…" : "发布到 Wiki"}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3 rounded-md bg-muted/55 p-3">
                          <div>
                            <div className="text-sm font-medium">
                              Wiki 中的所有人
                            </div>
                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              任何人都可以查看此页面。
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => void copyPageLink()}
                          >
                            复制链接
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
                {mode === "edit" && !draftMode && pageId && (
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
                      <Label htmlFor="parent-page">父页面</Label>
                      <select
                        id="parent-page"
                        value={selectedParentId}
                        onChange={(event) => {
                          parentIdRef.current = event.target.value;
                          setSelectedParentId(event.target.value);
                          notifyChange();
                        }}
                        className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8"
                      >
                        <option value="">无父页面</option>
                        {editorLinkablePages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {getWikiDisplayTitle(page.title)}
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
                          notifyChange();
                        }}
                        placeholder="简要描述你的修改"
                        rows={3}
                      />
                    </div>
                    {mode === "edit" && pageId && (
                      <div className="flex items-center justify-between border-t pt-3">
                        {!draftMode && (
                          <Link
                            href={`/wiki/history/${pageId}`}
                            className={buttonVariants({
                              variant: "ghost",
                              size: "sm",
                            })}
                          >
                            历史记录
                          </Link>
                        )}
                        {canDelete && onDelete && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className={draftMode ? "ml-auto" : undefined}
                            disabled={submitting}
                            onClick={() => void handleDeletePage()}
                          >
                            删除页面
                          </Button>
                        )}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                {!draftMode && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={mode === "edit" ? "md:hidden" : undefined}
                  >
                    {submitting ? "完成中…" : "完成"}
                  </Button>
                )}
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
                          notifyChange();
                        }}
                      />
                    </div>
                    <Input
                      id="title"
                      aria-label="页面标题"
                      disabled={publishing}
                      value={title}
                      onChange={(e) => {
                        titleRef.current = e.target.value;
                        setTitle(e.target.value);
                        if (draftMode && pageId && wikiTree) {
                          const mutationToken = wikiTree.projectUpsert({
                            id: pageId,
                            title: e.target.value,
                            icon: iconRef.current,
                            parentId: parentIdRef.current || null,
                          });
                          wikiTree.confirm(mutationToken);
                        }
                        notifyChange();
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
                        onCompositionEnd={notifyChange}
                      />
                    </EditorContainer>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      aria-label="保存错误"
                      className="mt-4 flex flex-wrap items-center gap-2 text-sm text-red-500"
                    >
                      <span>{error}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void copyLocalSnapshot(getCurrentDraftSnapshot())
                        }
                      >
                        复制本地内容
                      </Button>
                    </div>
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
                    label: "父页面",
                    mine: selectedParent?.title ?? "无",
                    theirs:
                      editorLinkablePages.find(
                        (page) => page.id === conflict.theirParentId,
                      )?.title ?? (conflict.theirParentId ? "其他页面" : "无"),
                  },
                ].filter((field) => field.mine !== field.theirs)}
                mineText={formatWikiContentForDiff(
                  serializeContentWithoutDraftComments(editor.children),
                )}
                theirText={formatWikiContentForDiff(conflict.theirContent)}
                saving={submitting}
                onCopy={() => void copyLocalSnapshot(getCurrentDraftSnapshot())}
                onReturn={() => void adoptConflictServer(false)}
                onDiscard={() => void adoptConflictServer(true)}
              />
            )}
            {draftRecovery && !conflict && !canAutoRecoverDraft && (
              <EditConflictDialog
                ariaLabel="恢复本地草稿"
                title="发现未发送的本地草稿"
                description={
                  draftRecovery.classification === "stale-generation"
                    ? "服务器正文已回滚到新的内容代际，旧草稿不会自动合并。你可以复制需要的内容，再基于服务器版本继续编辑。"
                    : "这份内容尚未被服务器确认。服务器公开版本保持不变；请对比后决定是否保留其中的内容。"
                }
                fields={
                  recoveredDraft
                    ? [
                        {
                          label: "标题",
                          mine: recoveredDraft.title || "未命名",
                          theirs: initialTitle || "未命名",
                        },
                        {
                          label: "图标",
                          mine: recoveredDraft.icon ?? "无",
                          theirs: initialIcon ?? "无",
                        },
                        {
                          label: "父页面",
                          mine:
                            editorLinkablePages.find(
                              (page) => page.id === recoveredDraft.parentId,
                            )?.title ??
                            (recoveredDraft.parentId ? "其他页面" : "无"),
                          theirs:
                            editorLinkablePages.find(
                              (page) => page.id === parentId,
                            )?.title ?? (parentId ? "其他页面" : "无"),
                        },
                      ].filter((field) => field.mine !== field.theirs)
                    : []
                }
                mineText={
                  recoveredDraft
                    ? formatWikiContentForDiff(recoveredDraft.content)
                    : draftRecovery.record.draftSnapshot
                }
                theirText={formatWikiContentForDiff(initialContent)}
                saving={false}
                onCopy={() =>
                  void copyLocalSnapshot(draftRecovery.record.draftSnapshot)
                }
                onReturn={() => {
                  wikiDraft.resume();
                  setDraftRecovery(null);
                }}
                onDiscard={() => {
                  void wikiDraft.discard().then(() => {
                    wikiDraft.resume();
                    setDraftRecovery(null);
                  });
                }}
              />
            )}
          </div>
        </DiscussionProvider>
      </WikiLinkPagesProvider>
    </Plate>
  );
}
