"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProfessionalAchievementRule } from "@/lib/achievement-actions";

export function AchievementRuleForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function submit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      try {
        await createProfessionalAchievementRule({
          ruleKey: String(formData.get("ruleKey") ?? ""),
          version: Number(formData.get("version")),
          displayName: String(formData.get("displayName") ?? ""),
          description: String(formData.get("description") ?? ""),
          badgeCode: String(formData.get("badgeCode") ?? ""),
          tier: String(formData.get("tier")) as "bronze" | "silver" | "gold",
          subjectGroups: String(formData.get("subjectGroups") ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [codes, count] = line.split(":");
              return {
                subjectCodes: codes
                  .split("/")
                  .map((code) => code.trim())
                  .filter(Boolean),
                requiredCount: Number(count),
              };
            }),
          prerequisiteRuleKey: String(
            formData.get("prerequisiteRuleKey") ?? "",
          ),
          enabled: formData.get("enabled") === "on",
        });
        setMessage("规则已保存");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  return (
    <form
      action={submit}
      className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
    >
      <Field
        label="规则标识"
        name="ruleKey"
        placeholder="math-bronze"
        required
      />
      <Field
        label="版本"
        name="version"
        type="number"
        defaultValue="1"
        required
      />
      <Field
        label="称号名称"
        name="displayName"
        placeholder="数学铜标"
        required
      />
      <Field
        label="四位专业代码"
        name="badgeCode"
        placeholder="MATH"
        required
      />
      <div>
        <Label htmlFor="achievement-tier">等级</Label>
        <select
          className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          id="achievement-tier"
          name="tier"
        >
          <option value="bronze">铜标</option>
          <option value="silver">银标</option>
          <option value="gold">金标</option>
        </select>
      </div>
      <Field
        label="前置规则标识（银/金）"
        name="prerequisiteRuleKey"
        placeholder="math-bronze"
      />
      <div className="sm:col-span-2">
        <Label htmlFor="achievement-subject-groups">学科组</Label>
        <Textarea
          id="achievement-subject-groups"
          name="subjectGroups"
          className="mt-1 font-mono"
          placeholder={"MATH:4\n或\nENGG:2\nCSCI:2"}
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          每行“学科/学科:门数”；同一行表示任意学科合计。
        </p>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="achievement-description">说明</Label>
        <Textarea
          id="achievement-description"
          name="description"
          className="mt-1"
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input className="size-4" name="enabled" type="checkbox" />
        保存后立即启用（会停用同一规则标识的旧版本）
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? "保存中…" : "保存规则"}
        </Button>
        {message && (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `achievement-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} className="mt-1" {...props} />
    </div>
  );
}
