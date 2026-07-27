"use client";

import { RevisionDiff } from "@/components/wiki/revision-diff";
import { Button } from "@/components/ui/button";

export interface EditConflict {
  theirContent: string;
  theirTitle: string;
  theirIcon: string | null;
  theirSlug: string;
  theirParentId: string | null;
  theirVersion: number;
  theirUpdatedAt: string;
}

export interface EditConflictField {
  label: string;
  mine: string;
  theirs: string;
}

export function EditConflictDialog({
  fields = [],
  mineText,
  theirText,
  saving,
  onKeepMine,
  onDiscard,
  onCancel,
}: {
  fields?: EditConflictField[];
  mineText: string;
  theirText: string;
  saving: boolean;
  onKeepMine: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="编辑冲突"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-lg border bg-background p-6">
        <div>
          <h2 className="text-lg font-semibold">编辑冲突，无法自动合并</h2>
          <p className="text-sm text-muted-foreground">
            该页面已被他人修改，且与你的改动重叠。请对比后选择处理方式，已写内容不会被丢弃。
          </p>
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
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            继续编辑
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={saving}>
            放弃我的改动，加载最新
          </Button>
          <Button onClick={onKeepMine} disabled={saving}>
            {saving ? "保存中…" : "保留我的版本另存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
