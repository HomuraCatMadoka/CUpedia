"use client";

import { useState, useTransition } from "react";
import { CheckIcon, MessageSquareIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Discussion } from "@/lib/discussion-actions";
import { addReply, resolveDiscussion } from "@/lib/discussion-actions";
import { cn } from "@/lib/utils";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";

function TimeAgo({ date }: { date: Date }) {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (minutes < 1) text = "刚刚";
  else if (minutes < 60) text = `${minutes}分钟前`;
  else if (hours < 24) text = `${hours}小时前`;
  else text = `${days}天前`;

  return <span className="text-xs text-muted-foreground">{text}</span>;
}

function DiscussionMessage({ discussion }: { discussion: Discussion }) {
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <div className="min-w-0 flex items-center gap-2">
        <span className="min-w-0 truncate text-xs font-medium">
          {discussion.user.nickname}
        </span>
        <TimeAgo date={discussion.createdAt} />
      </div>
      <p className="break-words text-sm">{discussion.content}</p>
    </div>
  );
}

export function DiscussionThread({
  discussion,
  onUpdate,
  readOnly = false,
}: {
  discussion: Discussion;
  onUpdate: () => void;
  readOnly?: boolean;
}) {
  const [reply, setReply] = useState("");
  const [pending, startTransition] = useTransition();
  const { ensureContributorSetup } = useContributorSetup();

  const handleReply = () => {
    if (!reply.trim()) return;
    startTransition(async () => {
      if (!(await ensureContributorSetup())) return;
      await addReply(discussion.id, reply);
      setReply("");
      onUpdate();
    });
  };

  const handleResolve = () => {
    startTransition(async () => {
      await resolveDiscussion(discussion.id);
      onUpdate();
    });
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3",
        discussion.resolved && "opacity-60",
      )}
    >
      <DiscussionMessage discussion={discussion} />

      {discussion.replies.map((r) => (
        <div key={r.id} className="ml-4 border-l-2 border-muted pl-3">
          <DiscussionMessage discussion={r} />
        </div>
      ))}

      {!discussion.resolved && !readOnly && (
        <>
          <div className="flex min-w-0 gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              aria-label="回复内容"
              placeholder="回复..."
              rows={1}
              className="min-h-11 min-w-0 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleReply();
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="发送回复"
              onClick={handleReply}
              disabled={pending || !reply.trim()}
              className="size-11 shrink-0"
            >
              <SendIcon aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {discussion.canResolve && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResolve}
              disabled={pending}
              className="self-start text-xs"
            >
              <CheckIcon aria-hidden="true" className="mr-1 h-3 w-3" />
              标记为已解决
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function NewCommentForm({
  submitting = false,
  onSubmit,
  onCancel,
}: {
  submitting?: boolean;
  onSubmit: (content: string) => void;
  onCancel: () => void;
}) {
  const [content, setContent] = useState("");

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageSquareIcon aria-hidden="true" className="h-3 w-3" />
        新建批注
      </div>
      <Textarea
        value={content}
        disabled={submitting}
        onChange={(e) => setContent(e.target.value)}
        aria-label="批注内容"
        placeholder="输入批注内容..."
        rows={2}
        className="resize-none text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!submitting && content.trim()) onSubmit(content);
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
          className="text-xs"
        >
          取消
        </Button>
        <Button
          size="sm"
          onClick={() => content.trim() && onSubmit(content)}
          disabled={submitting || !content.trim()}
          className="text-xs"
        >
          提交
        </Button>
      </div>
    </div>
  );
}
