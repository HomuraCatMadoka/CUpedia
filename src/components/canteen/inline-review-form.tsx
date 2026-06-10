"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface InlineReviewFormProps {
  dishName: string;
  onClose: () => void;
  onSubmit: (review: { type: "like" | "dislike"; text: string; author: string }) => void;
}

export function InlineReviewForm({ dishName, onClose, onSubmit }: InlineReviewFormProps) {
  const [reviewType, setReviewType] = useState<"like" | "dislike">("like");
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");

  const handleSubmit = () => {
    if (!text.trim()) return;
    onSubmit({
      type: reviewType,
      text: text.trim(),
      author: author.trim() || "匿名食客",
    });
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-900">
          评价「{dishName}」
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 transition-colors hover:text-neutral-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Like / Dislike toggle */}
      <div className="mb-3 flex gap-3 select-none">
        <button
          type="button"
          onClick={() => setReviewType("like")}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
            reviewType === "like"
              ? "border-rose-400 bg-rose-50 text-rose-700"
              : "border-neutral-200 text-neutral-600 hover:border-neutral-300"
          }`}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill={reviewType === "like" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 22V11M2 13v7a2 2 0 0 0 2 2h12.4a2 2 0 0 0 1.94-1.52l2.1-8.4A2 2 0 0 0 18.5 10H15V5a3 3 0 0 0-3-3l-1.4 1.4a4.25 4.25 0 0 0-1.17 2.35L8.5 11" />
          </svg>
          赞
        </button>
        <button
          type="button"
          onClick={() => setReviewType("dislike")}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all ${
            reviewType === "dislike"
              ? "border-neutral-400 bg-neutral-100 text-neutral-700"
              : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
          }`}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill={reviewType === "dislike" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 2v11m5-2v-7a2 2 0 0 0-2-2H7.6a2 2 0 0 0-1.94 1.52l-2.1 8.4A2 2 0 0 0 5.5 14H9v5a3 3 0 0 0 3 3l1.4-1.4a4.25 4.25 0 0 0 1.17-2.35L15.5 13" />
          </svg>
          踩
        </button>
      </div>

      {/* Textarea */}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="说点什么吧…"
        className="mb-3 min-h-[80px] resize-y text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />

      {/* Author */}
      <Input
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="你的昵称（选填）"
        maxLength={12}
        className="mb-3 text-sm"
      />

      {/* Actions */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          以评论气泡形式发布
        </span>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="text-xs"
        >
          提交
        </Button>
      </div>
    </div>
  );
}
