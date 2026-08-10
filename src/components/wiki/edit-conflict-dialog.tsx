"use client";

import { RevisionDiff } from "@/components/wiki/revision-diff";
import { Button } from "@/components/ui/button";

export interface EditConflict {
  theirContent: string;
  theirTitle: string;
  theirIcon: string | null;
  theirParentId: string | null;
  theirVersion: number;
  theirContentGeneration: number;
  theirUpdatedAt: string;
  theirHiddenChildPageIds: string[];
}

export interface EditConflictField {
  label: string;
  mine: string;
  theirs: string;
}

export function EditConflictDialog({
  ariaLabel = "编辑冲突",
  title = "编辑冲突，无法自动合并",
  description = "服务器版本已更新，且与你的改动重叠。服务器版本保持不变；请复制需要保留的内容，再基于服务器版本继续编辑。",
  fields = [],
  mineText,
  theirText,
  saving,
  onCopy,
  onDiscard,
  onReturn,
}: {
  ariaLabel?: string;
  title?: string;
  description?: string;
  fields?: EditConflictField[];
  mineText: string;
  theirText: string;
  saving: boolean;
  onCopy: () => void;
  onDiscard: () => void;
  onReturn: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-lg border bg-background p-6">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {fields.length > 0 && (
          <div
            role="region"
            aria-label="页面属性冲突"
            className="overflow-hidden rounded-md border text-sm"
          >
            <div className="grid grid-cols-[minmax(5rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 bg-muted/50 px-3 py-2 font-medium">
              <span>属性</span>
              <span>服务器最新版本</span>
              <span>我的版本</span>
            </div>
            {fields.map((field) => (
              <div
                key={field.label}
                className="grid grid-cols-[minmax(5rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t px-3 py-2"
              >
                <span className="font-medium">{field.label}</span>
                <span className="break-words">{field.theirs}</span>
                <span className="break-words">{field.mine}</span>
              </div>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RevisionDiff
            oldText={theirText}
            newText={mineText}
            oldLabel="服务器最新版本"
            newLabel="我的版本"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="outline" onClick={onCopy} disabled={saving}>
            复制我的内容
          </Button>
          <Button variant="outline" onClick={onReturn} disabled={saving}>
            返回编辑最终结果
          </Button>
          <Button onClick={onDiscard} disabled={saving}>
            放弃本地草稿并加载服务器版本
          </Button>
        </div>
      </div>
    </div>
  );
}
